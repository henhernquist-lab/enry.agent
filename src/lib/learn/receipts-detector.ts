import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { registerReceiptsHook, type ContradictionCandidate } from './receipts-hook'

// Similarity threshold above which an outgoing user message is treated as a
// contradiction candidate against any of the user's stored claims. Below
// this, they're just topically related — not worth interrupting for.
const CONTRADICTION_THRESHOLD = 0.78

// Active ReceiptsHook — registers itself on import. The hook is called by
// src/app/api/chat/route.ts fire-and-forget on every outgoing user message:
// it must return Promise<ContradictionCandidate[] | null> and never throw
// (matches the contract at src/lib/learn/receipts-hook.ts).
async function enryReceiptsDetector(params: {
  userId: string
  googleId: string
  message: string
}): Promise<ContradictionCandidate[] | null> {
  // Empty / trivially short messages can't carry enough semantic content to
  // be worth comparing.
  const trimmed = params.message.trim()
  if (trimmed.length < 10) return null

  try {
    // 1. Embed the outgoing message.
    const { embedding, error: embedErr } = await generateEmbedding(trimmed)
    if (embedErr || !embedding) {
      // Embedding failures are non-fatal — just skip this turn.
      return null
    }

    // 2. Pull the closest stored claims via the match_claims RPC
    //    (migration 020_learn_features). The RPC does pgvector cosine
    //    similarity against this user's claims.
    const { data: matches, error: rpcErr } = await supabase.rpc('match_claims', {
      query_embedding: embedding,
      match_threshold: CONTRADICTION_THRESHOLD,
      match_count: 5,
      p_user_id: params.userId,
    })
    if (rpcErr || !matches) return null

    // 3. Light polarity heuristic: if the message starts with a negation
    //    ("I don't", "I no longer", "never", "actually I'm wrong about", ...)
    //    AND there's a high-similarity claim, it's plausible a contradiction.
    //    The base itself never decides what counts as contradiction — the
    //    detector picks; model surface uses similarity score.
    const NEGATION_PREFIXES = [
      /^(\s*)(i\s+(don'?t|do\s+not|never|no\s+longer)|not\s+|never\s+|actually\s+i'?m\s+wrong\s+about|actually\s+i\s+was\s+wrong\s+about|i\s+used\s+to\s+think|on\s+second\s+thought)/i,
    ]
    const looksLikeNegation = NEGATION_PREFIXES.some((re) => re.test(trimmed))

    return (matches as { id: string; content: string; similarity: number }[]).map((m) => ({
      claimId: m.id,
      claimContent: m.content,
      similarity: m.similarity,
      // Hint surfaced to the model — currently binary; UI flips to "you argued
      // the opposite" only when this is true. Could be tuned to a richer
      // polarity score, but a binary hint is enough for v1 interrupt UX.
      ...(looksLikeNegation ? { negationHint: true as unknown as undefined } : {}),
    }))
  } catch (err) {
    // Never let a Receipts exception kill chat. Log and bail null.
    console.error('[receipts-detector] threw:', err)
    return null
  }
}

// Side-effect: register on module load. chat/route.ts imports this module for
// its side effect, so the registration runs before the route's first
// getReceiptsHook() call.
registerReceiptsHook(enryReceiptsDetector)

export { enryReceiptsDetector }
