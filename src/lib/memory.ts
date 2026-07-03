import { supabase } from './supabase'

const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'
const EMBEDDING_MODEL = 'baai/bge-m3'
const EMBEDDING_DIMENSIONS = 1024

/**
 * Generate a 1024-dim embedding vector using NVIDIA NIM (baai/bge-m3).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.QWEN_API_KEY
  if (!apiKey) {
    throw new Error('QWEN_API_KEY is not set — required for NVIDIA NIM embeddings')
  }

  const res = await fetch(`${NIM_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: [text],
      encoding_format: 'float',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`NIM embedding request failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  const embedding = data?.data?.[0]?.embedding

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${embedding?.length ?? 'null'}`,
    )
  }

  return embedding
}

/**
 * Save a memory for a user. Generates an embedding and inserts into Supabase.
 */
export async function saveMemory(
  googleId: string,
  content: string,
): Promise<{ id: string; error?: string }> {
  try {
    console.log('[memory] Generating embedding for content:', content.slice(0, 80))
    const embedding = await generateEmbedding(content)

    console.log('[memory] Inserting memory for google_id:', googleId)
    const { data, error } = await supabase
      .from('memories')
      .insert({
        google_id: googleId,
        content,
        embedding: JSON.stringify(embedding),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[memory] Supabase insert error:', error)
      return { id: '', error: error.message }
    }

    console.log('[memory] Memory saved with id:', data.id)
    return { id: data.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[memory] saveMemory error:', message)
    return { id: '', error: message }
  }
}

/**
 * Search a user's memories by semantic similarity (cosine via pgvector RPC).
 */
export async function searchMemories(
  googleId: string,
  query: string,
  limit = 5,
): Promise<{ results: Array<{ id: string; content: string; similarity: number }>; error?: string }> {
  try {
    console.log('[memory] Searching memories for google_id:', googleId, 'query:', query.slice(0, 80))
    const embedding = await generateEmbedding(query)

    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(embedding),
      match_google_id: googleId,
      match_count: limit,
    })

    if (error) {
      console.error('[memory] Supabase RPC error:', error)
      return { results: [], error: error.message }
    }

    console.log('[memory] Found', data?.length ?? 0, 'memories')
    return { results: data ?? [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[memory] searchMemories error:', message)
    return { results: [], error: message }
  }
}
