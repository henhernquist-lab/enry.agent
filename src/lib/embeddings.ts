// NVIDIA NIM embeddings. Model history: baai/bge-m3 began returning 500 for
// every request on this key (July 2026) — silently killing all semantic search
// — so we moved to nv-embedqa-e5-v5: same 1024 dims (matches the vector(1024)
// columns), but ASYMMETRIC — pass 'passage' when embedding stored content and
// 'query' when embedding a search string, or similarity scores degrade.
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5'
export const EMBEDDING_DIMENSIONS = 1024

export type EmbeddingInputType = 'passage' | 'query'

export async function generateEmbedding(
  text: string,
  inputType: EmbeddingInputType = 'passage',
): Promise<number[] | null> {
  const apiKey = process.env.BGE_M3_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [text.slice(0, 8192)],
        encoding_format: 'float',
        input_type: inputType,
        // e5-v5 has a 512-token context; truncate server-side instead of 400ing
        truncate: 'END',
      }),
    })

    if (!res.ok) {
      console.error('[embeddings] API error:', res.status, await res.text().catch(() => ''))
      return null
    }

    const data = await res.json()
    const embedding = (data.data?.[0]?.embedding as number[]) ?? null
    if (embedding && embedding.length !== EMBEDDING_DIMENSIONS) {
      console.error(`[embeddings] expected ${EMBEDDING_DIMENSIONS} dims, got ${embedding.length}`)
      return null
    }
    return embedding
  } catch (err) {
    console.error('[embeddings] Failed to generate embedding:', err)
    return null
  }
}
