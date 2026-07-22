import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from '../nim'
import { getRepoTree } from '../github'
import type { WriteOpsContext } from './write-ops'

// Live Terminal write mode — natural-language routing.
//
// "fix the typo in the README" needs a concrete target file before it can go
// through the same propose_edit path as an explicit `edit <file>` command.
// This resolves that one file (never more than one per propose/apply step —
// the terminal proposes one diff at a time, same as the explicit command)
// and enforces the coding-only scope boundary: anything that isn't actually
// a file change request gets refused here, before any file is touched or any
// diff generated, so it can't turn the terminal into a general chat window.
//
// Multi-file features ARE supported — but as a sequence of single-file steps
// the user approves one at a time, not a single auto-applied multi-file plan.
// See SCOPE_SYSTEM_PROMPT's "multi_file" decision for the contract and
// resolveNLEditTarget's caller (exec/route.ts) for how the step-breakdown is
// surfaced as a [CLARIFY] chooser the user clicks through.

export interface NLTarget {
  file: string
  isNewFile: boolean
}

export interface NLStep {
  file: string
  isNewFile: boolean
  instruction: string
}

export type NLResolveResult =
  // Flatten clarify/multiFile into the failure variant directly (rather than
  // splitting them into separate union members) so callers can read either
  // optional field off the same `ok:false` object — TS would otherwise narrow
  // to exactly one branch on `if (!nl.ok)` and block reading the other field.
  // Both fields are mutually exclusive in practice but a single shape keeps
  // every caller's access pattern simple and typo-proof.
  | { ok: true; target: NLTarget }
  | { ok: false; error: string; clarify?: { question: string; options: string[] }; multiFile?: { summary: string; steps: NLStep[] } }

// One prior turn from the session's command log, surfaced to the classifier so
// it can recognise a follow-up ("do multiple files", "yes go ahead",
// "actually two instead") as a CONTINUATION of the previous request rather
// than an unrelated statement. Without this, the classifier sees every
// message in isolation — which is what produced the original
// "meta-comment about the editing interface" misclassification: a user typing
// "so it doesn't need to be single file do multiple files" right after a
// rejected multi-file feature request looks like Drive commentary when you
// can't see the prior turn. The session's commands[] log already stores every
// input — the classifier just needs a tail of it.
export interface NLHistoryTurn {
  input: string
  result: 'resolved' | 'refused' | 'clarified' | 'multi_file' | 'other'
  resultDetail?: string
}

const SCOPE_SYSTEM_PROMPT = `You route natural-language requests typed into enry.agent's Live Terminal —
a coding interface whose job is to make ONE edit to ONE file per propose/apply
step in the active repository. Your only job: given a request, the repo's file
list, and (when available) the recent turns from this same session, decide if
this is a legitimate single-file repo edit, and if so which ONE file it
targets.

CRITICAL: this repo's source IS the source of truth for the UI, the copy,
the colors, the layout, the behavior, the docs, the tests, the schema, every
label the user sees. Requests like "make the buttons green", "rename this
label", "add a Cancel button", "fix the spacing on the chat input", "make
the error message friendlier", or "change the page title" are perfectly
valid single-file edits here — pick the matching file (or ask if
ambiguous). UI changes, styling, copy, naming, labeling, formatting,
behavior tweaks, docs, comments, schema, tests, config — all of these are
legitimate repo edits when they map to one file.

Four possible decisions:

"resolve" — the request clearly maps to one file. Name it:
- If the file exists in the provided list, is_new_file: false, file: its
  exact path from the list.
- If it doesn't exist and the request is clearly "create X", is_new_file:
  true, file: a sensible new path consistent with the repo's structure.

This includes ANY of these, provided they map cleanly to one file:
- behavior changes / bug fixes / refactors
- UI / styling / color / spacing / typography / layout changes
- copy / wording / label / placeholder / tooltip / error message edits
- new UI elements (add a button, add a column, add a tab)
- renames (variable, function, file, exported symbol, button label)
- type / schema / config / test changes
- comment / doc / readme / changelog changes

"clarify" — the request IS a plausible single-file repo edit (any category
above) but you cannot confidently pick the single target file from the repo's
file list — e.g. it references "the screenshot" or named UI elements/labels
that could plausibly live in more than one component, OR the repo has
multiple files that could reasonably match. Do NOT refuse these — ask
instead. Give one short, sharp question and 2-4 concrete options (e.g.
named candidate files, or "something else — describe it").

"multi_file" — the request is a legitimate feature/change that genuinely
spans more than one file (e.g. "add Crews/Squads" needs schema + backend +
UI; "rename this exported symbol everywhere"; "add a new API route + a
component that calls it"). NEVER refuse these as "can't be done" — Drive
DOES support multi-file changes, just one file at a time: each step below
becomes a single-file propose/apply the user clicks through in order, then
they run commit once to land all of them. Return an ordered list of
single-file steps in "steps", each with its own "file", "is_new_file", and
a focused "instruction" for that one step that the next pass can act on
verbatim. Keep steps concrete and small — 2-7 steps, each describing the
single-file change for that step, not the whole feature. Order them so each
step builds on the previous ones (e.g. schema → backend → UI). The first
step must be one the user can approve right now. Also return a one-sentence
"summary" of the overall change. The wire format turns these steps into a
chooser the user accepts to start at step 1.

"refuse" — the request is NOT a repo edit at all: chit-chat, factual
questions, knowledge questions, requests about non-repo topics (weather,
news, life stuff — those belong in the regular chat, not here). Being
unable to name a file is NOT grounds for refuse — that's "clarify" (one
file plausible) or "multi_file" (several files plausible). Only refuse
things that were never a repo edit in the first place.

CONTINUATIONS / FOLLOW-UPS (critical — this is a real misclassification
that's already been seen in production):
When recent_turns are provided, a short follow-up message like "do
multiple files", "yes", "go ahead", "two files instead", "actually make
it three", "so it doesn't need to be single file", "do it across the
backend and UI", or "no, edit both" is almost certainly a CONTINUATION of
the previous request — the user adjusting/answering/refining it — NOT a
comment about the Live Terminal interface itself. Treat it as part of the
same thread, not as Drive UI commentary, and route it the same way you'd
route the original request (usually "multi_file" if they're explicitly
asking for multiple files, or "resolve" if they're confirming a single
target). Only classify something as a "meta-comment about the editing
interface" if it is unambiguously about the Drive UI itself AND has no
plausible repo-edit continuation interpretation given the recent turns —
and even then, prefer "multi_file" or "clarify" over "refuse" if there's
any prior edit request in the conversation.

Hard safety guard rails (LLM-level; the JS parser adds its own check too):
- One file per propose/apply step. If the request would require editing
  multiple files in a single edit, that's the "multi_file" decision: return
  an ordered step breakdown, do NOT invent a single multi-file plan that
  writes several files at once.
- The resolved \`file\` path must be relative to the repo root, no leading
  slash, no \`..\` segments — refuse to resolve anything outside the repo.
  Same for every file path in a multi_file steps[] list.
- This interface is for repo editing, not free-form chat. Don't take on
  conversational tasks (jokes, recipes, brainstorming, factual Q&A) here.

Output JSON only:
{ "decision": "resolve" | "clarify" | "multi_file" | "refuse", "reason": string, "file": string, "is_new_file": boolean, "question": string, "options": string[], "summary": string, "steps": [{ "file": string, "is_new_file": boolean, "instruction": string }] }
reason: one sentence — why resolved to this file, why clarifying, why multi-file, or why refused.
question/options: only populated when decision is "clarify".
summary/steps: only populated when decision is "multi_file".`

// Cap on how much history we surface to the classifier. Enough to give the
// model the prior rejected request and any clarifying back-and-forth, not so
// much that we crowd out the file list or push latency. Tail of the session's
// commands[] log — most recent last.
const MAX_HISTORY_TURNS = 6
// Only the last N chars of any single turn's input, to bound prompt size.
const MAX_TURN_CHARS = 600

function formatHistory(turns: NLHistoryTurn[] | undefined): string {
  if (!turns || turns.length === 0) return ''
  const lines = turns.slice(-MAX_HISTORY_TURNS).map((t, i) => {
    const clipped = t.input.length > MAX_TURN_CHARS
      ? `${t.input.slice(0, MAX_TURN_CHARS)}…`
      : t.input
    return `  ${i + 1}. [${t.result}] "${clipped.replace(/\n/g, ' ')}"`
  })
  return `\nRecent turns in THIS session (most recent last — treat any short follow-up as a continuation of these, not as unrelated commentary about the interface):\n${lines.join('\n')}\n`
}

export async function resolveNLEditTarget(
  ctx: WriteOpsContext,
  instruction: string,
  history?: NLHistoryTurn[],
): Promise<NLResolveResult> {
  const { tree, error: treeError } = await getRepoTree(ctx.accessToken, ctx.owner, ctx.repo, ctx.defaultBranch)
  if (treeError) return { ok: false, error: `Could not read repo file list: ${treeError}` }

  const fileList = tree.map((f) => f.path).slice(0, 500).join('\n')
  return classifyNLEditTarget(fileList, instruction, ctx.model, history)
}

// Split out from resolveNLEditTarget so the classification step (the actual
// LLM decision logic) is testable without a live GitHub token / repo tree.
export async function classifyNLEditTarget(
  fileList: string,
  instruction: string,
  model?: string,
  history?: NLHistoryTurn[],
): Promise<NLResolveResult> {
  try {
    const client = nimClientFor(model)
    const historyBlock = formatHistory(history)
    const { text } = await generateText({
      model: client.chat(model ?? DEFAULT_NIM_MODEL),
      system: SCOPE_SYSTEM_PROMPT,
      prompt: `Repo files:\n${fileList}\n${historyBlock}\nRequest: "${instruction}"\n\nDecide now.`,
      temperature: 0.2,
      maxOutputTokens: 600,
      timeout: 25_000,
      // maxRetries: 1 would let the AI SDK silently retry a timed-out call,
      // doubling worst-case wall-clock to 2x this timeout — invisible from
      // here, but real to the caller's own maxDuration budget. A single
      // attempt that fails cleanly and surfaces a real error beats a retry
      // that quietly eats the invocation's remaining time.
      maxRetries: 0,
    })

    const parsed = parseJsonLoose<{
      decision: 'resolve' | 'clarify' | 'multi_file' | 'refuse'
      reason: string
      file: string
      is_new_file: boolean
      question: string
      options: string[]
      summary: string
      steps: Array<{ file: string; is_new_file: boolean; instruction: string }>
    }>(text)
    if (!parsed) return { ok: false, error: 'Could not parse the request. Try being more specific about which file and what change.' }

    if (parsed.decision === 'multi_file') {
      const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : []
      const steps: NLStep[] = []
      for (const s of rawSteps) {
        if (!s || typeof s !== 'object') continue
        const file = typeof s.file === 'string' ? s.file.trim() : ''
        const instructionText = typeof s.instruction === 'string' ? s.instruction.trim() : ''
        if (!file || !instructionText) continue
        // Same path-safety guard as the resolve path — refuse to resolve
        // anything that escapes the repo, even inside a multi-step plan.
        if (file.startsWith('/') || file.includes('..')) continue
        steps.push({ file, isNewFile: !!s.is_new_file, instruction: instructionText })
      }
      if (steps.length === 0) {
        // Model returned multi_file but no usable steps — degrade to a
        // clear, honest refuse explaining Drive's per-step model rather
        // than a generic parse failure (which reads like a bug).
        return {
          ok: false,
          error: `That needs changes across multiple files. Drive edits one file per step — tell me which file to start with, or break the feature down into single-file steps and name the first one.`,
        }
      }
      const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : `Split into ${steps.length} single-file step${steps.length === 1 ? '' : 's'}`
      // Cap at 7 steps — more than that is too much to plan up front; the
      // user should iterate after the first few land.
      return { ok: false, error: summary, multiFile: { summary, steps: steps.slice(0, 7) } }
    }

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
    // Distinguish a timeout from a genuine routing failure — this is NIM
    // backend latency on the classify call (25s budget, no retry by design,
    // see above), not a code fault, and the message should say so instead of
    // reading like one. Same distinction already made in write-ops.ts and the
    // skill-response paths.
    const name = err instanceof Error ? err.name : ''
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = name === 'TimeoutError' || name === 'AbortError' || /abort|timed?\s?out/i.test(msg)
    const detail = isTimeout
      ? "the model was slow to respond and this timed out — that's backend latency, not a bug. Just try again, or switch models if it keeps happening."
      : msg
    return { ok: false, error: `Request routing failed: ${detail}` }
  }
}
