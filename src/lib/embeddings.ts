export async function generateEmbedding(text: string): Promise<number[] | null> {
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
        model: 'baai/bge-m3',
        input: text.slice(0, 8192),
        encoding_format: 'float',
      }),
    })

    if (!res.ok) {
      console.error('[embeddings] API error:', res.status, await res.text().catch(() => ''))
      return null
    }

    const data = await res.json()
    return (data.data?.[0]?.embedding as number[]) ?? null
  } catch (err) {
    console.error('[embeddings] Failed to generate embedding:', err)
    return null
  }
}
