import { supabase } from '@/lib/supabase'
import { isTableMissing } from '@/lib/usage/log'
import { COMMUNITY_MODEL_PREFIX } from '@/lib/nim'
import { BLACK_MARKET_CATALOG, type BlackMarketModel } from '@/lib/lab/black-market'

// ───────────────────────────────────────────────────────────────────
// Community models (The Black Market → Enry registry).
//
// Persistence + servability resolution for community HF models. Only repos
// present in BLACK_MARKET_CATALOG can be added — the client sends an hfId,
// the server looks up the vetted catalog entry for metadata. Servability is
// resolved live against the HF Inference Providers mapping; a model with no
// live provider cannot be added (honest: no fake "installed" state).
// ───────────────────────────────────────────────────────────────────

/** Client-safe shape the pickers consume. */
export interface CommunityModel {
  modelId: string // community:<hfId>:<provider>
  hfId: string
  provider: string
  label: string
  company: string
  description: string
  baseModel: string | null
  params: string | null
  license: string | null
  badges: string[]
}

export interface Servability {
  servable: boolean
  provider: string | null
  /** Human-readable reason when not servable — surfaced in the UI. */
  reason: string | null
}

interface HfProviderMappingEntry {
  provider: string
  status?: string
  providerId?: string
}

/**
 * Resolve whether an HF repo can actually be served by an Inference Provider.
 * Returns the first 'live' provider. Never throws — network failure yields a
 * not-servable result with a reason, so the UI can disable honestly.
 */
export async function resolveServability(hfId: string): Promise<Servability> {
  try {
    const key = process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN ?? ''
    const res = await fetch(
      `https://huggingface.co/api/models/${hfId}?expand[]=inferenceProviderMapping`,
      { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) {
      return { servable: false, provider: null, reason: `Hugging Face lookup failed (HTTP ${res.status})` }
    }
    const data = (await res.json()) as { inferenceProviderMapping?: HfProviderMappingEntry[] | Record<string, { status?: string }> }
    const mapping = data.inferenceProviderMapping

    // The API returns either an array of {provider,status} or an object keyed
    // by provider. Normalize to a list and pick the first live one.
    let live: string | null = null
    if (Array.isArray(mapping)) {
      live = mapping.find((m) => m.status === 'live')?.provider ?? null
    } else if (mapping && typeof mapping === 'object') {
      live = Object.entries(mapping).find(([, v]) => v?.status === 'live')?.[0] ?? null
    }

    if (!live) {
      return { servable: false, provider: null, reason: 'No Hugging Face inference provider serves this model' }
    }
    return { servable: true, provider: live, reason: null }
  } catch {
    return { servable: false, provider: null, reason: 'Could not reach Hugging Face to check availability' }
  }
}

export function catalogEntry(hfId: string): BlackMarketModel | undefined {
  return BLACK_MARKET_CATALOG.find((m) => m.hfId === hfId)
}

interface CommunityRow {
  model_id: string
  hf_id: string
  provider: string
  label: string
  company: string
  description: string
  base_model: string | null
  params: string | null
  license: string | null
  badges: string[] | null
}

function rowToModel(r: CommunityRow): CommunityModel {
  return {
    modelId: r.model_id,
    hfId: r.hf_id,
    provider: r.provider,
    label: r.label,
    company: r.company,
    description: r.description,
    baseModel: r.base_model,
    params: r.params,
    license: r.license,
    badges: Array.isArray(r.badges) ? r.badges : [],
  }
}

/** The user's added community models. Empty list if the table isn't applied yet. */
export async function listCommunityModels(userId: string): Promise<CommunityModel[]> {
  const { data, error } = await supabase
    .from('community_models')
    .select('model_id, hf_id, provider, label, company, description, base_model, params, license, badges')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isTableMissing(error)) return []
    throw new Error(error.message)
  }
  return (data as CommunityRow[]).map(rowToModel)
}

export type AddResult =
  | { ok: true; model: CommunityModel }
  | { ok: false; error: string; status: number }

/**
 * Add a catalog model to the user's registry. Validates it's a known catalog
 * repo and that a live HF provider serves it, then persists. Idempotent-ish:
 * a duplicate add returns the existing model.
 */
export async function addCommunityModel(userId: string, hfId: string): Promise<AddResult> {
  const entry = catalogEntry(hfId)
  if (!entry) return { ok: false, error: 'Unknown model — not in the Black Market catalog.', status: 400 }

  const serv = await resolveServability(hfId)
  if (!serv.servable || !serv.provider) {
    return { ok: false, error: serv.reason ?? 'This model has no available inference provider.', status: 422 }
  }

  const modelId = `${COMMUNITY_MODEL_PREFIX}${hfId}:${serv.provider}`
  const row = {
    user_id: userId,
    model_id: modelId,
    hf_id: hfId,
    provider: serv.provider,
    label: entry.name,
    company: entry.creator,
    description: `Community · ${entry.baseModel} · experimental, unvetted.`,
    base_model: entry.baseModel,
    params: entry.params,
    license: entry.license,
    badges: entry.badges,
  }

  const { data, error } = await supabase
    .from('community_models')
    .insert(row)
    .select('model_id, hf_id, provider, label, company, description, base_model, params, license, badges')
    .single()

  if (error) {
    if (isTableMissing(error)) {
      return { ok: false, error: 'Community models table not applied yet (run the migration).', status: 503 }
    }
    // Unique violation → already added; return the existing one.
    if (error.code === '23505') {
      const existing = (await listCommunityModels(userId)).find((m) => m.modelId === modelId)
      if (existing) return { ok: true, model: existing }
    }
    return { ok: false, error: error.message, status: 500 }
  }

  return { ok: true, model: rowToModel(data as CommunityRow) }
}

/** Remove by exact model_id or by hf_id (whichever the caller has). */
export async function removeCommunityModel(
  userId: string,
  ref: { modelId?: string; hfId?: string },
): Promise<{ ok: boolean; error?: string }> {
  let q = supabase.from('community_models').delete().eq('user_id', userId)
  if (ref.modelId) q = q.eq('model_id', ref.modelId)
  else if (ref.hfId) q = q.eq('hf_id', ref.hfId)
  else return { ok: false, error: 'modelId or hfId required' }

  const { error } = await q
  if (error && !isTableMissing(error)) return { ok: false, error: error.message }
  return { ok: true }
}
