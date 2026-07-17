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

export type NLResolveResult =
  | { ok: true; target: NLTarget }
  | { ok: false; error: string; clarify?: { question: string; options: string[] } }

const SCOPE_SYSTEM_PROMPT = `You route natural-language requests typed into enry.agent's Live Terminal — a
CODING-ONLY interface. Your only job: given a request and the repo's file
list, decide whether this is a legitimate single-file code change request,
and if so, which ONE file it targets.

Three possible decisions:

"resolve" — the request clearly maps to one file. Name it:
- If the file exists in the provided list, is_new_file: false, file: its
  exact path from the list.
- If it doesn't exist and the request is clearly "create X", is_new_file:
  true, file: a sensible new path consistent with the repo's structure.

"clarify" — the request IS a plausible code/UI change (describes a bug,
a visual element, a behavior to fix) but you cannot confidently pick the
single target file from the repo's file list — e.g. it references "the
screenshot" or named UI elements/labels that could plausibly live in more
than one component, or the repo has multiple files that could reasonably
match. Do NOT refuse these — ask instead. Give one short, sharp question
and 2-4 concrete options (e.g. named candidate files, or "something else —
describe it").

"refuse" — the request is NOT a code change at all: questions, conversation,
requests about non-coding topics (notes, races, life stuff — those belong
in the regular chat, not here), or requests spanning more than one file's
worth of intent. Being unable to name a file is NOT by itself grounds for
refuse — that's "clarify". Only refuse things that were never a single-file
code change request in the first place.

Output JSON only:
{ "decision": "resolve" | "clarify" | "refuse", "reason": string, "file": string, "is_new_file": boolean, "question": string, "options": string[] }
reason: one sentence — why resolved to this file, why clarifying, or why refused.
question/options: only populated when decision is "clarify".`

export async function resolveNLEditTarget(ctx: WriteOpsContext, instruction: string): Promise<NLResolveResult> {
  const { tree, error: treeError } = await getRepoTree(ctx.accessToken, ctx.owner, ctx.repo, ctx.defaultBranch)
  if (treeError) return { ok: false, error: `Could not read repo file list: ${treeError}` }

  const fileList = tree.map((f) => f.path).slice(0, 500).join('\n')
  return classifyNLEditTarget(fileList, instruction, ctx.model)
}

// Split out from resolveNLEditTarget so the classification step (the actual
// LLM decision logic) is testable without a live GitHub token / repo tree.
export async function classifyNLEditTarget(fileList: string, instruction: string, model?: string): Promise<NLResolveResult> {
  try {
    const client = nimClientFor(model)
    const { text } = await generateText({
      model: client.chat(model ?? DEFAULT_NIM_MODEL),
      system: SCOPE_SYSTEM_PROMPT,
      prompt: `Repo files:\n${fileList}\n\nRequest: "${instruction}"\n\nDecide now.`,
      temperature: 0.2,
      maxOutputTokens: 400,
      timeout: 25_000,
      // maxRetries: 1 would let the AI SDK silently retry a timed-out call,
      // doubling worst-case wall-clock to 2x this timeout — invisible from
      // here, but real to the caller's own maxDuration budget. A single
      // attempt that fails cleanly and surfaces a real error beats a retry
      // that quietly eats the invocation's remaining time.
      maxRetries: 0,
    })

    const parsed = parseJsonLoose<{
      decision: 'resolve' | 'clarify' | 'refuse'
      reason: string
      file: string
      is_new_file: boolean
      question: string
      options: string[]
    }>(text)
    if (!parsed) return { ok: false, error: 'Could not parse the request. Try being more specific about which file and what change.' }

    if (parsed.decision === 'refuse') return { ok: false, error: `Not a code change I can make here: ${parsed.reason}` }

    if (parsed.decision === 'clarify') {
      const question = typeof parsed.question === 'string' && parsed.question.trim() ? parsed.question.trim() : 'Which file is this on?'
      const options = Array.isArray(parsed.options) ? parsed.options.filter((o) => typeof o === 'string' && o.trim()) : []
      return { ok: false, error: parsed.reason || question, clarify: { question, options } }
    }

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
