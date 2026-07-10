import { supabase } from './supabase'
import { generateEmbedding as sharedGenerateEmbedding, type EmbeddingInputType } from './embeddings'

/**
 * Thin throw-on-failure wrapper over the shared embeddings lib so this
 * module's existing catch-based error handling keeps working. (This used to
 * be a duplicate bge-m3 implementation on a different API key; both copies
 * broke at once when bge-m3 started 500ing — one implementation now.)
 */
export async function generateEmbedding(text: string, inputType: EmbeddingInputType = 'passage'): Promise<number[]> {
  const embedding = await sharedGenerateEmbedding(text, inputType)
  if (!embedding) throw new Error('NIM embedding request failed')
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
    const embedding = await generateEmbedding(query, 'query')

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
