import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { registerReceiptsHook, type ContradictionCandidate } from './receipts-hook'

// Similarity threshold above which an outgoing user message is treated as a
// contradiction candidate against any of the user's stored claims. Below
// this, they're just topically related — not worth interrupting for.
const CONTRADICTION_THRESHOLD = 0.78

// Negation-prefix regex. Pre-computed once at module load (not per-message).
// Logged for product-side observability; the model gets the same shape
// (claimId / claimContent / similarity) regardless of negation presence.
const NEGATION_RE = /^(\s*)(i\s+(don'?t|do\s+not|never|no\s+longer)|not\s+|never\s+|actually\s+i'?m\s+wrong\s+about|actually\s+i\s+was\s+wrong\s+about|i\s+used\s+to\s+think|on\s+second\s+thought)/i

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
    // 1. Embed the outgoing message. Use input_type='query' per the
    //    asymmetric embedding pair documented in src/lib/embeddings.ts —
    //    querying against stored claims needs the query-side encoding.
    const embedding = await generateEmbedding(trimmed, 'query')
    if (!embedding) {
      // Embedding failures are non-fatal — just skip this turn.
      return null
    }

    // 2. Pull the closest stored claims via the match_claims RPC
    //    (migration 020_learn_features). pgvector cosine similarity,
    //    filtered to this user's claims, ranked by similarity.
    const { data: matches, error: rpcErr } = await supabase.rpc('match_claims', {
      query_embedding: embedding,
      match_threshold: CONTRADICTION_THRESHOLD,
      match_count: 5,
      p_user_id: params.userId,
    })
    if (rpcErr || !matches) return null

    // 3. Observability: log whether the message carries a negation prefix.
    //    The model surface gets the same shape; a future UI iteration could
    //    bias the interrupt copy based on this signal.
    const looksLikeNegation = NEGATION_RE.test(trimmed)
    if (looksLikeNegation) {
      console.log('[receipts-detector] outgoing message starts with a negation prefix')
    }

    return (matches as { id: string; content: string; similarity: number }[]).map((m) => ({
      claimId: m.id,
      claimContent: m.content,
      similarity: m.similarity,
    }))
  } catch (err) {
    // Never let a Receipts exception kill chat. Log and bail null.
    console.error('[receipts-detector] threw:', err)
    return null
  }
}

// Side-effect: register on module load. chat/route.ts imports this module
// for its side effect, so the registration runs before the route's first
// getReceiptsHook() call.
registerReceiptsHook(enryReceiptsDetector)

export { enryReceiptsDetector }
