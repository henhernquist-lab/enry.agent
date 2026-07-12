import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from '../nim'
import { getRepoTree } from '../github'
import type { WriteOpsContext } from './write-ops'

// Live Terminal write mode — natural-language routing.
//
// "fix the typo in the README" needs a concrete target file before it can go
// through the same propose_edit path as an explicit `edit <file>` command.
// This resolves that one file (never more than one — the terminal proposes
// one change at a time, same as the explicit command) and enforces the
// coding-only scope boundary: anything that isn't actually a file change
// request gets refused here, before any file is touched or any diff
// generated, so it can't turn the terminal into a general chat window.

export interface NLTarget {
  file: string
  isNewFile: boolean
}

export type NLResolveResult = { ok: true; target: NLTarget } | { ok: false; error: string }

const SCOPE_SYSTEM_PROMPT = `You route natural-language requests typed into enry.agent's Live Terminal — a
CODING-ONLY interface. Your only job: given a request and the repo's file
list, decide whether this is a legitimate single-file code change request,
and if so, which ONE file it targets.

Refuse (refuse: true) anything that isn't a concrete code/file change:
questions, conversation, requests about non-coding topics (notes, races,
life stuff — those belong in the regular chat, not here), requests to
change more than one file's worth of intent, or anything too vague to name
a single target file for.

If it's legitimate, name exactly one file:
- If the file exists in the provided list, is_new_file: false, file: its
  exact path from the list.
- If it doesn't exist and the request is clearly "create X", is_new_file:
  true, file: a sensible new path consistent with the repo's structure.

Output JSON only:
{ "refuse": boolean, "reason": string, "file": string, "is_new_file": boolean }
reason: one sentence either way — why refused, or why this file.`

export async function resolveNLEditTarget(ctx: WriteOpsContext, instruction: string): Promise<NLResolveResult> {
  const { tree, error: treeError } = await getRepoTree(ctx.accessToken, ctx.owner, ctx.repo, ctx.defaultBranch)
  if (treeError) return { ok: false, error: `Could not read repo file list: ${treeError}` }

  const fileList = tree.map((f) => f.path).slice(0, 500).join('\n')

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: SCOPE_SYSTEM_PROMPT,
      prompt: `Repo files:\n${fileList}\n\nRequest: "${instruction}"\n\nDecide now.`,
      temperature: 0.2,
      maxOutputTokens: 400,
      timeout: 20_000,
      maxRetries: 1,
    })

    const parsed = parseJsonLoose<{ refuse: boolean; reason: string; file: string; is_new_file: boolean }>(text)
    if (!parsed) return { ok: false, error: 'Could not parse the request. Try being more specific about which file and what change.' }
    if (parsed.refuse) return { ok: false, error: `Not a code change I can make here: ${parsed.reason}` }
    if (!parsed.file || typeof parsed.file !== 'string') return { ok: false, error: 'Could not identify a target file.' }

    const safe = !parsed.file.startsWith('/') && !parsed.file.includes('..')
    if (!safe) return { ok: false, error: 'Resolved an unsafe file path — refusing.' }

    return { ok: true, target: { file: parsed.file, isNewFile: !!parsed.is_new_file } }
  } catch (err) {
    console.error('[terminal/nl-edit] resolution threw:', err)
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Request routing failed: ${detail}` }
  }
}
