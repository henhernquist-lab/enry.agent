import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { tavily } from '@tavily/core'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { saveMemory, searchMemories } from '@/lib/memory'
import { listRepos, listIssues, createIssue, getFileContent } from '@/lib/github'
import { createBranch, createFile, updateFile, createPR, createRepo } from '@/lib/github-write'
import { resolveResourceUserId } from '@/lib/resource-user'
import { supabase } from '@/lib/supabase'
import { getSkill, getSkills, buildMultiSkillPrompt } from '@/lib/skills/registry'
import { parseSessionFocusId, SESSION_FOCUS_PROMPTS, sessionFocusLabel } from '@/lib/focus-mode'
import { insertSkillInvocation, updateSkillInvocationOutput, getActivePromptOverride } from '@/lib/lab/db'
import { modelSupportsReasoning } from '@/lib/reasoning-trace'
import { compactMessages } from '@/lib/compaction'
import { nimClientFor } from '@/lib/nim'
import { logUsage } from '@/lib/usage/log'
import { buildComposioTools } from '@/lib/composio-tools'
import { monidDiscover, monidRun } from '@/lib/monid'
import { getReceiptsHook } from '@/lib/learn/receipts-hook'
import { RecoveryManager } from '@/lib/recovery/recovery-manager'
// Side-effect import: registers enryReceiptsDetector as the active
// ReceiptsHook at module-load time, before this route's first
// getReceiptsHook() call below. Order matters — must precede any code
// that could call getReceiptsHook.
import '@/lib/learn/receipts-detector'
import type { GitHubActionPayload } from '@/lib/resources'

import { listModels } from '@/lib/nim'

// Chat-scoped model allowlist — subset of MODEL_LIST that has 'chat' scope.
const CHAT_MODELS = listModels('chat').map((m) => m.id)
const DEFAULT_MODEL = CHAT_MODELS[0] ?? 'deepseek/deepseek-v4-pro'

export const maxDuration = 60

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY ?? '' })

// ─── Focus Mode — controls which tools are available ────────────────────
type FocusMode = 'all' | 'memory_only' | 'web_only' | 'repo_only'

function buildTools(mode: FocusMode, googleId: string | undefined, githubToken: string | undefined, uid: string | null): Record<string, any> {
  const enableMemory = mode === 'all' || mode === 'memory_only'
  const enableWeb = mode === 'all' || mode === 'web_only'
  const enableRepo = mode === 'all' || mode === 'repo_only'

  const tools: Record<string, any> = {}

  if (enableWeb) {
    tools.web_search = tool({
      description: 'Search the web for current, real-time information. Use this for news, prices, recent events, people, or anything that may have changed.',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        max_results: z.number().optional().default(5).describe('Number of results to return'),
      }),
      execute: async ({ query, max_results }) => {
        const response = await tavilyClient.search(query, { maxResults: max_results, includeAnswer: true })
        return { answer: response.answer, results: response.results.map(r => ({ title: r.title, url: r.url, content: r.content })) }
      },
    })
  }

  if (enableMemory) {
    tools.save_memory = tool({
      description: 'Save an important fact about the user to long-term memory.',
      inputSchema: z.object({ content: z.string().describe('The fact or information to remember') }),
      execute: async ({ content }) => {
        if (!googleId) return { success: false, error: 'Not authenticated.' }
        const result = await saveMemory(googleId, content)
        if (result.error) return { success: false, error: result.error }
        return { success: true, id: result.id, content }
      },
    })

    tools.recall_memory = tool({
      description: "Search the user's long-term memory for relevant past information.",
      inputSchema: z.object({
        query: z.string().describe('What to search for in memory'),
        limit: z.number().optional().default(5).describe('Maximum number of results'),
      }),
      execute: async ({ query, limit }) => {
        if (!googleId) return { results: [], error: 'Not authenticated.' }
        const result = await searchMemories(googleId, query, limit)
        if (result.error) return { results: [], error: result.error }
        return { results: result.results }
      },
    })
  }

  if (enableRepo && githubToken) {
    tools.github_list_repos = tool({
      description: "List Henry's GitHub repositories.",
      inputSchema: z.object({}),
      execute: async () => {
        const { repos, error } = await listRepos(githubToken)
        if (error) return { repos: [], error }
        return { repos: repos.map(r => ({ name: r.full_name, private: r.private, description: r.description, language: r.language, stars: r.stargazers_count, updated_at: r.updated_at, url: r.html_url })) }
      },
    })

    tools.github_read_file = tool({
      description: 'Read a file from a GitHub repo, or list directory contents.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('File or directory path'),
      }),
      execute: async ({ owner, repo, path }) => {
        const { content, error } = await getFileContent(githubToken, owner, repo, path)
        if (error) return { content: null, error }
        const truncated = content && content.length > 20000 ? content.slice(0, 20000) + `\n\n[… truncated at 20 000 chars — ${content.length} total]` : content
        return { content: truncated }
      },
    })

    tools.github_create_issue = tool({
      description: 'Create a new GitHub issue.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), title: z.string(), body: z.string() }),
      execute: async ({ owner, repo, title, body }) => {
        const { issue, error } = await createIssue(githubToken, owner, repo, title, body)
        if (error) return { issue: null, error }
        return { issue: { number: issue!.number, title: issue!.title, url: issue!.html_url } }
      },
    })

    tools.github_list_issues = tool({
      description: 'List open issues on a GitHub repository.',
      inputSchema: z.object({ owner: z.string(), repo: z.string() }),
      execute: async ({ owner, repo }) => {
        const { issues, error } = await listIssues(githubToken, owner, repo)
        if (error) return { issues: [], error }
        return { issues: issues.map(i => ({ number: i.number, title: i.title, labels: i.labels.map(l => l.name), created_at: i.created_at, url: i.html_url })) }
      },
    })

    tools.github_create_branch = tool({
      description: 'Create a new branch off the default branch.',
      inputSchema: z.object({
        owner: z.string(), repo: z.string(), branch_name: z.string(),
        confirm: z.boolean().describe('Set false first to preview, true only after user confirms.'),
      }),
      execute: async ({ owner, repo, branch_name, confirm }) => {
        if (!confirm) return { status: 'preview', action: 'create_branch', repo: `${owner}/${repo}`, branch: branch_name, summary: `Create branch "${branch_name}" in ${owner}/${repo}.` }
        const result = await createBranch(githubToken, owner, repo, branch_name)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) {
          const payload: GitHubActionPayload = { action: 'create_branch', repo: `${owner}/${repo}`, branch: branch_name, summary: `Created branch "${branch_name}"`, timestamp: new Date().toISOString() }
          ;(async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Branch: ${branch_name}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })()
        }
        return { status: 'ok', repo: `${owner}/${repo}`, branch: branch_name }
      },
    })

    tools.github_create_file = tool({
      description: 'Create a new file on a branch.',
      inputSchema: z.object({
        owner: z.string(), repo: z.string(), path: z.string(), content: z.string(), message: z.string(), branch: z.string(),
        confirm: z.boolean().describe('Set false first to preview, true only after user confirms.'),
      }),
      execute: async ({ owner, repo, path, content, message, branch, confirm }) => {
        if (!confirm) return { status: 'preview', action: 'create_file', repo: `${owner}/${repo}`, branch, file_path: path, content_summary: content.slice(0, 500) + (content.length > 500 ? '…' : ''), message, summary: `Create "${path}" on "${branch}" in ${owner}/${repo}.` }
        const result = await createFile(githubToken, owner, repo, path, content, message, branch)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) {
          const payload: GitHubActionPayload = { action: 'create_file', repo: `${owner}/${repo}`, branch, file_path: path, summary: `Created "${path}"`, timestamp: new Date().toISOString() }
          ;(async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Create: ${path}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })()
        }
        return { status: 'ok', repo: `${owner}/${repo}`, branch, file_path: path, url: result.url }
      },
    })

    tools.github_update_file = tool({
      description: 'Edit an existing file on a branch.',
      inputSchema: z.object({
        owner: z.string(), repo: z.string(), path: z.string(), content: z.string(), message: z.string(), branch: z.string(),
        confirm: z.boolean().describe('Set false first to preview, true only after user confirms.'),
      }),
      execute: async ({ owner, repo, path, content, message, branch, confirm }) => {
        if (!confirm) return { status: 'preview', action: 'update_file', repo: `${owner}/${repo}`, branch, file_path: path, content_summary: content.slice(0, 500) + (content.length > 500 ? '…' : ''), message, summary: `Update "${path}" on "${branch}" in ${owner}/${repo}.` }
        const result = await updateFile(githubToken, owner, repo, path, content, message, branch)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) {
          const payload: GitHubActionPayload = { action: 'update_file', repo: `${owner}/${repo}`, branch, file_path: path, summary: `Updated "${path}"`, timestamp: new Date().toISOString() }
          ;(async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Update: ${path}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })()
        }
        return { status: 'ok', repo: `${owner}/${repo}`, branch, file_path: path, url: result.url }
      },
    })

    tools.github_create_pull_request = tool({
      description: 'Open a PR from a working branch into base.',
      inputSchema: z.object({
        owner: z.string(), repo: z.string(), title: z.string(), body: z.string(), head_branch: z.string(), base_branch: z.string().default('main'),
        confirm: z.boolean().describe('Set false first to preview, true only after user confirms.'),
      }),
      execute: async ({ owner, repo, title, body, head_branch, base_branch, confirm }) => {
        if (!confirm) return { status: 'preview', action: 'create_pr', repo: `${owner}/${repo}`, title, body, head: head_branch, base: base_branch, summary: `Open PR: "${title}" from "${head_branch}" → "${base_branch}"` }
        const result = await createPR(githubToken, owner, repo, title, body, head_branch, base_branch)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) {
          const payload: GitHubActionPayload = { action: 'create_pr', repo: `${owner}/${repo}`, branch: head_branch, pr_url: result.url, summary: `Opened PR #${result.number}: "${title}"`, timestamp: new Date().toISOString() }
          ;(async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `PR #${result.number}: ${title}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })()
        }
        return { status: 'ok', repo: `${owner}/${repo}`, pr_url: result.url, number: result.number, head: head_branch, base: base_branch }
      },
    })

    tools.github_create_repo = tool({
      description: "Create a brand new GitHub repository.",
      inputSchema: z.object({
        name: z.string(), description: z.string(), private: z.boolean().default(true),
        confirm: z.boolean().describe('Set false first to preview, true only after user confirms.'),
      }),
      execute: async ({ name, description, private: isPrivate, confirm }) => {
        if (!confirm) return { status: 'preview', action: 'create_repo', name, description, private: isPrivate, summary: `Create ${isPrivate ? 'private' : 'public'} repo "${name}"` }
        const result = await createRepo(githubToken, name, description, isPrivate)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) {
          const payload: GitHubActionPayload = { action: 'create_repo', repo: name, summary: `Created ${isPrivate ? 'private' : 'public'} repo "${name}"`, timestamp: new Date().toISOString() }
          ;(async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Repo: ${name}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })()
        }
        return { status: 'ok', name, url: result.url, private: isPrivate }
      },
    })

    tools.github_read_enryrules = tool({
      description: 'Read .enryrules from a repo — project-specific conventions, naming patterns, "always/never" rules. Call before editing any repo file. Returns empty if the repo has no .enryrules file.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
      }),
      execute: async ({ owner, repo }) => {
        const { content, error } = await getFileContent(githubToken, owner, repo, '.enryrules')
        if (error && error.includes('404')) return { content: null, exists: false, note: 'No .enryrules file in this repo. Proceed with standard conventions.' }
        if (error) return { content: null, error }
        return { content, exists: true }
      },
    })
  }

  return tools
}

// ─── Context Compaction ────────────────────────────────────────────────
// Delegated to src/lib/compaction.ts — extracts key decisions, files
// touched, and unresolved questions from older messages.

// ─── Main Route ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json()
  const { messages, model, userProfile, skill: skillSlug, skills: skillSlugs, skillTurn, recovery, partialContent } = body
  const selectedModel: string = CHAT_MODELS.includes(model) ? model : DEFAULT_MODEL

  // ─── Recovery Mode ─────────────────────────────────────────
  // When the frontend detects a stream interruption, it sends a
  // follow-up request with recovery: true and the partial content
  // that was received before the interruption. We inject a
  // continuation prompt so the model picks up where it left off.
  const recoveryManager = new RecoveryManager()
  const isRecovery = recovery === true
  let recoverySystemPrompt = ''
  if (isRecovery) {
    recoveryManager.startRequest()
    recoveryManager.markStreaming()
    if (typeof partialContent === 'string') {
      recoveryManager.recordPartial(partialContent)
    }
    recoverySystemPrompt = '\n\nCONTINUATION REQUEST: Your previous response was interrupted unexpectedly. Continue exactly where you left off. Do NOT restart, summarize, or repeat any previous content. Do NOT apologize or acknowledge the interruption. Simply continue writing as if nothing happened.'
    if (typeof partialContent === 'string' && partialContent.length > 0) {
      recoverySystemPrompt += `\n\nThe last content sent before the interruption was:\n\n${partialContent.slice(-500)}\n\nContinue from the exact point this was cut off.`
    }
  }

  let chatClient: ReturnType<typeof nimClientFor>
  try {
    chatClient = nimClientFor(selectedModel)
  } catch {
    return new Response(
      JSON.stringify({ error: `No API key configured for ${selectedModel}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const focusMode: FocusMode = ['all', 'memory_only', 'web_only', 'repo_only'].includes(body.focusMode) ? body.focusMode : 'all'
  const reasoningDepth: string = ['off','summary','full'].includes(body.reasoningDepth) ? body.reasoningDepth : 'off'

  // Session focus (domain scope — orthogonal to focusMode/source scope).
  // Accepts the compact wire form "drive" | "learn" | "school" | "none"
  // | "custom:<id>"; unknown values collapse to "none" via the parser.
  // Used for: 1) a directive line in the system prompt so the agent
  // self-contextualizes, 2) hinting the agent which skill family to lean
  // toward. (Server-side doesn't run phrase matching — that's client-side
  // in center-panel via detectSkillInvocation on the typed input — so the
  // server's job here is just labeling the session for the model.)
  const sessionFocus = parseSessionFocusId(body.sessionFocus ?? 'none')
  const focusLabel = sessionFocusLabel(sessionFocus)
  const focusPrompt = sessionFocus.kind === 'seed' ? SESSION_FOCUS_PROMPTS[sessionFocus.id] : null
  const sessionFocusDirective = sessionFocus.kind !== 'none' && focusPrompt
    ? `\n\n${focusPrompt}`
    : sessionFocus.kind === 'custom'
      ? `\n\nSESSION FOCUS: ${sessionFocus.id.toUpperCase()} — the user has set a custom posture for this session. Adopt a tone and approach that matches this label.`
      : ''

  const session = await auth()
  const googleId    = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    console.warn('[chat/route] Could not resolve user UUID for audit trail — googleId:', googleId)
  }

  const modelMessages = await convertToModelMessages(messages)

  // Apply context compaction (extracts decisions, files, unresolved Qs)
  const compactResult = compactMessages(modelMessages as Parameters<typeof compactMessages>[0])
  const { messages: finalMessages, compacted, summary: compactionSummary } = compactResult

  // Receipts (Enry Learn extension point): let a registered detector check the
  // outgoing user message against the user's claims for contradiction. No-op
  // by default (see src/lib/learn/receipts-hook.ts) — Freebuff registers the
  // real detector. Deliberately NOT awaited: fire-and-forget so chat latency is
  // never affected, now or once a real hook is registered.
  if (uid && googleId) {
    const outgoingUserText = String(finalMessages.findLast((m) => m.role === 'user')?.content ?? '')
    if (outgoingUserText) {
      getReceiptsHook()({ userId: uid, googleId, message: outgoingUserText })
        .then((candidates) => {
          if (candidates?.length) console.log('[receipts] contradiction candidates:', candidates.length)
        })
        .catch((err) => console.error('[receipts] hook threw:', err))
    }
  }

  const focusDirective = focusMode !== 'all'
    ? `\n\nFOCUS MODE: ${focusMode.replace(/_/g, ' ').toUpperCase()} — you are restricted to only the tools available in this mode. Do not attempt to use tools outside this scope.`
    : ''

  // ─── Multi-skill mode ────────────────────────────────────────────────
  const multiSlugs: string[] = Array.isArray(skillSlugs) && skillSlugs.length > 0
    ? skillSlugs
    : typeof skillSlug === 'string'
      ? [skillSlug]
      : []
  const activeSkills = multiSlugs.length > 0 ? getSkills(multiSlugs) : []
  if (activeSkills.length > 0) {
    const combinedSystem = buildMultiSkillPrompt(
      activeSkills.map((skill) => ({ skill, topic: '', via: 'command' as const })),
    )
    const turn = Number.isFinite(skillTurn) ? Math.max(1, Math.floor(skillTurn)) : 1

    const userText = finalMessages.findLast((m) => m.role === 'user')?.content ?? ''
    let invocationId: string | null = null

    // Determine prompt version — check for active DB overrides
    let promptVersion = 'base'
    if (uid) {
      try {
        const overrides = await Promise.all(
          activeSkills.map((s) => getActivePromptOverride(uid, s.slug)),
        )
        const activeOverride = overrides.find((o) => o !== null)
        if (activeOverride) {
          promptVersion = `override:${activeOverride.id}`
        }
      } catch (err) {
        console.error('[chat/route] failed to check prompt overrides:', err)
      }
    }

    if (uid) {
      try {
        invocationId = await insertSkillInvocation(uid, {
          skill_slug: multiSlugs.join('+'),
          prompt_version: promptVersion,
          input_topic: String(userText).slice(0, 2000),
          output_text: '',
          model_used: selectedModel,
          effort_used: 'medium',
          mode: 'chat',
          source: 'chat',
          explicit_feedback: null,
          implicit_score: 0,
          conversation_id: null,
          follow_up_message_id: null,
        })
      } catch (err) {
        console.error('[chat/route] failed to log skill invocation:', err)
      }
    }

    const skillStartedAt = Date.now()
    const skillResult = streamText({
      model: chatClient.chat(selectedModel),
      system: `${combinedSystem}\n\nCURRENT TURN: You are on assistant turn ${turn}. Produce this turn's content.${focusDirective}${sessionFocusDirective}${isRecovery ? recoverySystemPrompt : ''}`,
      messages: finalMessages as any,
      ...(reasoningDepth !== 'off' && modelSupportsReasoning(selectedModel) ? {
        providerOptions: { openai: { extra_body: { chat_template_kwargs: { enable_thinking: true } } } },
      } : {}),
      // No explicit timeout, and the AI SDK defaults maxRetries to 2 when
      // unset — a slow/degraded model plus an automatic retry can silently
      // double wall-clock past this route's maxDuration (60s) before any
      // error surfaces, same root cause as Drive's terminal-exec timeout bug.
      // maxRetries: 0 fails once, cleanly, instead of doubling in the dark.
      maxRetries: 0,
      // Left unset, the SDK requests the model's full context window as
      // max_tokens. DeepSeek now routes through OpenRouter on a free-tier
      // key with a real dollar ceiling per request — an uncapped request
      // (65536 tokens) exceeds what the account can afford and the call
      // fails outright before generating anything. 4096 is comfortably
      // within a normal chat reply and well under the account's affordable
      // ceiling (~11.5k tokens at last check).
      maxOutputTokens: 4096,
      onError: ({ error }) => { console.error('streamText multi-skill error:', error) },
      onFinish: async ({ text, usage }) => {
        if (invocationId) {
          await updateSkillInvocationOutput(invocationId, text).catch((err) => {
            console.error('[chat/route] failed to update skill invocation output:', err)
          })
        }
        // Usage observability — resilient, never breaks the response.
        if (uid) {
          logUsage({
            userId: uid,
            modelId: selectedModel,
            mode: 'chat',
            promptTokens: usage?.inputTokens,
            completionTokens: usage?.outputTokens,
            totalTokens: usage?.totalTokens,
            latencyMs: Date.now() - skillStartedAt,
          }).catch(() => {})
        }
      },
    })
    return skillResult.toUIMessageStreamResponse({
      headers: compacted ? { 'X-Context-Compacted': 'true', 'X-Context-Compacted-Summary': encodeURIComponent(compactionSummary ?? '') } : undefined,
      onError: (error) => {
        console.error('chat route multi-skill error:', error)
        return error instanceof Error ? error.message : 'Something went wrong'
      },
    })
  }

  // Build tools based on focus mode
  const allTools: Record<string, any> = {}
  if (focusMode === 'all' || focusMode === 'web_only') {
    allTools.web_search = tool({
      description: 'Search the web for current, real-time information. Use this for news, prices, recent events, people, or anything that may have changed.',
      inputSchema: z.object({ query: z.string().describe('The search query'), max_results: z.number().optional().default(5).describe('Number of results to return') }),
      execute: async ({ query, max_results }: { query: string; max_results?: number }) => {
        const response = await tavilyClient.search(query, { maxResults: max_results, includeAnswer: true })
        return { answer: response.answer, results: response.results.map((r: any) => ({ title: r.title, url: r.url, content: r.content })) }
      },
    })
  }
  if (focusMode === 'all' || focusMode === 'memory_only') {
    allTools.save_memory = tool({
      description: 'Save an important fact about the user to long-term memory.',
      inputSchema: z.object({ content: z.string().describe('The fact or information to remember') }),
      execute: async ({ content }: { content: string }) => {
        if (!googleId) return { success: false, error: 'Not authenticated.' }
        const result = await saveMemory(googleId, content)
        if (result.error) return { success: false, error: result.error }
        return { success: true, id: result.id, content }
      },
    })
    allTools.recall_memory = tool({
      description: "Search the user's long-term memory for relevant past information.",
      inputSchema: z.object({ query: z.string().describe('What to search for in memory'), limit: z.number().optional().default(5).describe('Maximum number of results') }),
      execute: async ({ query, limit }: { query: string; limit?: number }) => {
        if (!googleId) return { results: [], error: 'Not authenticated.' }
        const result = await searchMemories(googleId, query, limit)
        if (result.error) return { results: [], error: result.error }
        return { results: result.results }
      },
    })
  }
  if ((focusMode === 'all' || focusMode === 'repo_only') && githubToken) {
    allTools.github_list_repos = tool({
      description: "List Henry's GitHub repositories.",
      inputSchema: z.object({}),
      execute: async () => {
        const { repos, error } = await listRepos(githubToken)
        if (error) return { repos: [], error }
        return { repos: repos.map((r: any) => ({ name: r.full_name, private: r.private, description: r.description, language: r.language, stars: r.stargazers_count, updated_at: r.updated_at, url: r.html_url })) }
      },
    })
    allTools.github_read_file = tool({
      description: 'Read a file from a GitHub repo, or list directory contents.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), path: z.string() }),
      execute: async ({ owner, repo, path }: { owner: string; repo: string; path: string }) => {
        const { content, error } = await getFileContent(githubToken, owner, repo, path)
        if (error) return { content: null, error }
        const truncated = content && content.length > 20000 ? content.slice(0, 20000) + `\n\n[… truncated at 20 000 chars — ${content.length} total]` : content
        return { content: truncated }
      },
    })
    allTools.github_create_issue = tool({
      description: 'Create a new GitHub issue.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), title: z.string(), body: z.string() }),
      execute: async ({ owner, repo, title, body }: { owner: string; repo: string; title: string; body: string }) => {
        const { issue, error } = await createIssue(githubToken, owner, repo, title, body)
        if (error) return { issue: null, error }
        return { issue: { number: issue!.number, title: issue!.title, url: issue!.html_url } }
      },
    })
    allTools.github_list_issues = tool({
      description: 'List open issues on a GitHub repository.',
      inputSchema: z.object({ owner: z.string(), repo: z.string() }),
      execute: async ({ owner, repo }: { owner: string; repo: string }) => {
        const { issues, error } = await listIssues(githubToken, owner, repo)
        if (error) return { issues: [], error }
        return { issues: issues.map((i: any) => ({ number: i.number, title: i.title, labels: i.labels.map((l: any) => l.name), created_at: i.created_at, url: i.html_url })) }
      },
    })
    allTools.github_create_branch = tool({
      description: 'Create a new branch off the default branch.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), branch_name: z.string(), confirm: z.boolean().describe('Set false first to preview, true only after user confirms.') }),
      execute: async ({ owner, repo, branch_name, confirm }: { owner: string; repo: string; branch_name: string; confirm: boolean }) => {
        if (!confirm) return { status: 'preview', action: 'create_branch', repo: `${owner}/${repo}`, branch: branch_name, summary: `Create branch "${branch_name}" in ${owner}/${repo}.` }
        const result = await createBranch(githubToken, owner, repo, branch_name)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) {
          const payload: GitHubActionPayload = { action: 'create_branch', repo: `${owner}/${repo}`, branch: branch_name, summary: `Created branch "${branch_name}"`, timestamp: new Date().toISOString() }
          ;(async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Branch: ${branch_name}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })()
        }
        return { status: 'ok', repo: `${owner}/${repo}`, branch: branch_name }
      },
    })
    allTools.github_create_file = tool({
      description: 'Create a new file on a branch.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), path: z.string(), content: z.string(), message: z.string(), branch: z.string(), confirm: z.boolean().describe('Set false first to preview, true only after user confirms.') }),
      execute: async ({ owner, repo, path, content, message, branch, confirm }: { owner: string; repo: string; path: string; content: string; message: string; branch: string; confirm: boolean }) => {
        if (!confirm) return { status: 'preview', action: 'create_file', repo: `${owner}/${repo}`, branch, file_path: path, content_summary: content.slice(0, 500) + (content.length > 500 ? '…' : ''), message, summary: `Create "${path}" on "${branch}" in ${owner}/${repo}.` }
        const result = await createFile(githubToken, owner, repo, path, content, message, branch)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) { const payload: GitHubActionPayload = { action: 'create_file', repo: `${owner}/${repo}`, branch, file_path: path, summary: `Created "${path}"`, timestamp: new Date().toISOString() }; (async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Create: ${path}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })() }
        return { status: 'ok', repo: `${owner}/${repo}`, branch, file_path: path, url: result.url }
      },
    })
    allTools.github_update_file = tool({
      description: 'Edit an existing file on a branch.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), path: z.string(), content: z.string(), message: z.string(), branch: z.string(), confirm: z.boolean().describe('Set false first to preview, true only after user confirms.') }),
      execute: async ({ owner, repo, path, content, message, branch, confirm }: { owner: string; repo: string; path: string; content: string; message: string; branch: string; confirm: boolean }) => {
        if (!confirm) return { status: 'preview', action: 'update_file', repo: `${owner}/${repo}`, branch, file_path: path, content_summary: content.slice(0, 500) + (content.length > 500 ? '…' : ''), message, summary: `Update "${path}" on "${branch}" in ${owner}/${repo}.` }
        const result = await updateFile(githubToken, owner, repo, path, content, message, branch)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) { const payload: GitHubActionPayload = { action: 'update_file', repo: `${owner}/${repo}`, branch, file_path: path, summary: `Updated "${path}"`, timestamp: new Date().toISOString() }; (async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Update: ${path}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })() }
        return { status: 'ok', repo: `${owner}/${repo}`, branch, file_path: path, url: result.url }
      },
    })
    allTools.github_create_pull_request = tool({
      description: 'Open a PR from a working branch into base.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), title: z.string(), body: z.string(), head_branch: z.string(), base_branch: z.string().default('main'), confirm: z.boolean().describe('Set false first to preview, true only after user confirms.') }),
      execute: async ({ owner, repo, title, body, head_branch, base_branch, confirm }: { owner: string; repo: string; title: string; body: string; head_branch: string; base_branch: string; confirm: boolean }) => {
        if (!confirm) return { status: 'preview', action: 'create_pr', repo: `${owner}/${repo}`, title, body, head: head_branch, base: base_branch, summary: `Open PR: "${title}" from "${head_branch}" → "${base_branch}"` }
        const result = await createPR(githubToken, owner, repo, title, body, head_branch, base_branch)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) { const payload: GitHubActionPayload = { action: 'create_pr', repo: `${owner}/${repo}`, branch: head_branch, pr_url: result.url, summary: `Opened PR #${result.number}: "${title}"`, timestamp: new Date().toISOString() }; (async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `PR #${result.number}: ${title}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })() }
        return { status: 'ok', repo: `${owner}/${repo}`, pr_url: result.url, number: result.number, head: head_branch, base: base_branch }
      },
    })
    allTools.github_create_repo = tool({
      description: "Create a brand new GitHub repository.",
      inputSchema: z.object({ name: z.string(), description: z.string(), private: z.boolean().default(true), confirm: z.boolean().describe('Set false first to preview, true only after user confirms.') }),
      execute: async ({ name, description, private: isPrivate, confirm }: { name: string; description: string; private: boolean; confirm: boolean }) => {
        if (!confirm) return { status: 'preview', action: 'create_repo', name, description, private: isPrivate, summary: `Create ${isPrivate ? 'private' : 'public'} repo "${name}"` }
        const result = await createRepo(githubToken, name, description, isPrivate)
        if (!result.ok) return { status: 'error', error: result.error }
        if (uid) { const payload: GitHubActionPayload = { action: 'create_repo', repo: name, summary: `Created ${isPrivate ? 'private' : 'public'} repo "${name}"`, timestamp: new Date().toISOString() }; (async () => { const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Repo: ${name}`, payload }); if (auditError) console.error('[chat] audit insert failed:', auditError) })() }
        return { status: 'ok', name, url: result.url, private: isPrivate }
      },
    })
    allTools.github_read_enryrules = tool({
      description: 'Read .enryrules from a repo — project-specific conventions, naming patterns, "always/never" rules. Call before editing any repo file. Returns empty if the repo has no .enryrules file.',
      inputSchema: z.object({ owner: z.string().describe('Repository owner'), repo: z.string().describe('Repository name') }),
      execute: async ({ owner, repo }: { owner: string; repo: string }) => {
        const { content, error } = await getFileContent(githubToken, owner, repo, '.enryrules')
        if (error && error.includes('404')) return { content: null, exists: false, note: 'No .enryrules file in this repo. Proceed with standard conventions.' }
        if (error) return { content: null, error }
        return { content, exists: true }
      },
    })
  }

  // Attach Composio-backed Gmail + Calendar tools (read-only). buildComposioTools
  // returns {} when the user is unauthenticated, when focus mode disallows it
  // (web_only, repo_only), or when the user has no connected_account_id for a
  // given toolkit - so the model never sees a tool it can't actually call.
  const composioTools = await buildComposioTools(uid, focusMode)
  Object.assign(allTools, composioTools)

  // Monid — general-purpose API discovery/execution fallback. Always available
  // regardless of focus mode. The model should reach for this LAST, after
  // Tavily, Composio search, and Firecrawl have been considered.
  allTools.monid_api = tool({
    description: 'FALLBACK — discover and call third-party APIs for needs not covered by other tools. Use ONLY when Tavily (web_search), Composio search tools (composio_web_search, composio_finance, composio_flights, composio_amazon), Composio fetch (composio_fetch_url), and Firecrawl (firecrawl_scrape, firecrawl_crawl, firecrawl_extract, firecrawl_search, firecrawl_map) do NOT cover the specific API you need. Give it a natural-language description of what API/endpoint you want, and Monid discovers and executes the right one at runtime.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of the API call you need, e.g. "get the current Bitcoin price from CoinGecko", "search for JavaScript jobs on an obscure job board", "look up a statute on a legal database"'),
    }),
    execute: async ({ query }: { query: string }) => {
      const discovered = await monidDiscover(query)
      if (discovered.error) return { success: false, error: discovered.error }
      if (discovered.results.length === 0) return { success: false, error: `Monid found no APIs matching: ${query}` }

      const best = discovered.results[0]
      const runResult = await monidRun(best.provider, best.endpoint, {})
      return {
        success: runResult.status === 'COMPLETED',
        provider: best.provider,
        endpoint: best.endpoint,
        description: best.description,
        output: runResult.output,
        error: runResult.error,
      }
    },
  })

  const chatStartedAt = Date.now()
  const result = streamText({
    model: chatClient.chat(selectedModel),
    system: `You are enry.agent — Henry's personal AI superagent. You are NOT a generic conversational assistant, NOT ChatGPT, NOT Claude, NOT a chatbot. You are Henry's locked-in engineering collaborator, research partner, and executor.${isRecovery ? recoverySystemPrompt : ''}

You exist to move Henry's work forward: shipping features on the enry.agent codebase itself, answering technical questions with real research, running tool-calling loops on his behalf, and remembering context across sessions so he never has to re-explain his stack.

You are built on a Next.js + TypeScript + Supabase + NVIDIA NIM stack, running on Vercel. You have access to a pgvector-backed memory layer with bge-m3 embeddings, a resources table that stores everything Henry saves across 14+ tools, web search via Tavily (deep research), Composio-powered transactional lookup tools (real-time prices, flights, finance, e-commerce, page scraping), and Firecrawl for advanced web scraping, site crawling, structured data extraction, and site mapping. You know this because you ARE this system — not a wrapper on it.

Henry is a rising 9th grader at North Atlanta High School, a sprinter (200m/400m), and a lifter chasing a 225 bench. He builds software using AI-first workflows — Claude Code + Freebuff in parallel, Codespaces as his dev environment (older iMac limits local dev). He values direct feedback over hedging, realistic pushback over agreement, and shipping over perfection.

Do not treat him as a beginner. He built the system you run on. He knows his stack. Skip the hand-holding.

Direct, capable, no filler. Never open with "Great question," "I can help with that," "Certainly," "Here's the code," or any variation.
Lead with the outcome. First sentence answers "what happened" or "what did you find." Reasoning and detail come after.
Match Henry's tone: casual, fast, willing to curse a little when it fits, no corporate voice.
Readability > brevity. Don't compress into fragments — write real sentences. But cut every sentence that doesn't earn its place.
Code references use \`file_path:line_number\` format for clickthrough.
Formatting minimalism: use bold, headers, and bullets ONLY when the content is genuinely multi-dimensional (comparing options, listing distinct steps). Prose is the default, not the exception.
Never use bullets to soften a refusal, a failure report, or bad news. State it directly in a sentence.
Never use em-dash-heavy corporate cadence. That's the AI-slop tell.

Every non-trivial task follows this loop. You do not skip phases.

1. UNDERSTAND & SCOPE
   Figure out what Henry actually wants. If genuinely ambiguous, ask ONE sharp clarifying question — not three. If you can proceed with a reasonable assumption, state the assumption and proceed. Only pause for input when:
   - The action is destructive or irreversible (schema migration, mass delete, force-push)
   - Scope changed mid-task
   - Only Henry has the required info (credentials, preferences, private context)

2. PLAN
   For any task requiring 3+ steps, produce a short numbered plan before executing. Keep only ONE step in progress at a time. Do NOT design for hypothetical future needs — build the simplest thing that works. No premature abstraction.

3. EXECUTE
   Call tools one at a time when Tool B depends on Tool A's output. Batch parallel calls only when they're truly independent. Never fabricate tool responses to keep momentum.

4. VERIFY
   Before declaring done, prove it. If you wrote code, confirm it compiles / passes typecheck. If you claimed a row saved, query the table. If you fixed a bug, reproduce the original failure conditions and confirm they no longer trigger. Report the raw output of the verification step, not a summary.

5. REPORT
   Deliver the outcome. If Henry asked for a bug fix, don't tack on refactors. If he asked for a one-shot script, don't build a class hierarchy. Report failures with the same directness as successes — no softening, no "unfortunately."

You are strictly bound to the tools provided in this session. Do not invent tools, parameters, or endpoints. If a capability doesn't exist, state that instead of pretending.
NEVER repeat a failed tool call with identical parameters. Read the error, adjust, or escalate.
On persistent errors, search the exact error string via web_search before guessing. Never blind-fix the same error more than twice.
Temporal awareness: today's date matters. When searching for "latest X" or "current Y," include the actual current year in the query. Stale results from a wrong-year search waste turns.
Verify file existence before modifying. A prompt mentioning a file does not guarantee it exists — Henry may have moved, renamed, or forgotten to create it.
For any question about current facts (versions, APIs, prices, current state of external systems, news), web_search BEFORE answering. Do not answer from training data on anything that could have shifted.

Match existing repo conventions: naming, directory structure, styling patterns, framework paradigms. Read neighboring files before writing new ones.
Trust the repo's actual dependency manifest (package.json, etc.) over training assumptions. Never assume a library is installed — verify.
Follow the established stack: Next.js 16, TypeScript, pnpm, Supabase with pgvector + RLS, NextAuth v5, NVIDIA NIM (DeepSeek V4 Pro default, MiniMax M3, Qwen 3.5 397B, GLM 5.2), bge-m3 embeddings, Vercel deployment, Tavily search.
The \`resources\` table is the single source of truth for saved user content. New tools save here with a type discriminator and jsonb payload, source='user' (or 'daily_auto' / 'featured' for automation).
user_id in \`resources\` is a UUID that maps to \`profiles.id\`, NOT the raw Google account ID from NextAuth's session. Always resolve via resolveResourceUserId() before inserting. This was a real bug that ate a session; do not repeat it.
Never introduce a new design token (color, spacing, radius, font) without checking whether one already exists in globals.css / tailwind config. Match the established system.
Handle errors at system boundaries (user input, external API responses). Do NOT add defensive validation for scenarios that cannot happen inside trusted internal code.
Design philosophy: intentional > vibecoded. Generic AI-generated UI is Henry's explicit reject criterion. If a component looks templated, it's wrong.

Never expose, log, or commit secrets, API keys, or tokens. Secrets live in .env.local and Vercel env vars, nowhere else.
If Henry asks you to commit code containing a raw key, REFUSE and tell him why.
Never inline database credentials into client-side code. Server routes only.
Respect RLS. Do not disable RLS or bypass it via service role key except in explicit server-side admin routes (cron jobs, migrations) where it's necessary and clearly scoped.

Henry uses TWO agents in parallel:
- Claude Code (Opus 4.8) — reserved for major architecture, hard debugging, and gnarly multi-file changes
- Freebuff (DeepSeek V4 Pro, GLM 5.2 incoming) — high-volume parallel work: content generation, audits, research, seed data, UI polish

When Henry asks for a build prompt, default to routing work to Freebuff UNLESS the task specifically requires deep debugging, cross-file architecture, or destructive schema changes — those go to Claude Code. Always identify which agent fits which piece of a task.

When multiple parallel tasks can run without file conflicts, propose them as separate Freebuff prompts. Do not merge parallelizable work into a single sequential prompt.

Use recall_memory before answering anything that would benefit from Henry's saved context (his stack, preferences, current sprint, past decisions). Do not re-ask what you already know.

Use save_memory only for durable facts that will matter across sessions: new architectural decisions, permanent preferences, completed milestones, ongoing project state. Do NOT save transient chat content, one-off questions, or emotional context.

When Henry says "remember X" or "forget Y," use the appropriate memory tool immediately — do not just acknowledge conversationally.

State what you can and cannot do. If a tool is missing, say so — do not pretend to execute.
Never claim a step is done unless verified. Never claim a test passed unless you ran it and read the output.
If you don't know something and can't search for it, say so directly. Don't fabricate to fill space.
If Henry proposes something you think is wrong — technically, strategically, or otherwise — push back with your reasoning. Don't agree to be agreeable. He values realistic direct feedback.
Never end a turn stating intent ("I'll now run X") without actually running X in the same turn.

The following tools are available to you in this session:
- web_search — deep research and general queries via Tavily
- composio_web_search — transactional lookups (prices, flights, stocks, products, events, maps)
- composio_fetch_url — scrape and read full page content from a URL
- composio_finance — real-time stock/crypto/market data
- composio_flights — flight schedules and pricing
- composio_amazon — product search and price comparison
- firecrawl_scrape — advanced single-page scraping (JS-rendered pages, clean markdown)
- firecrawl_crawl — crawl entire websites (follow links within domain)
- firecrawl_extract — LLM-powered structured data extraction from any URL
- firecrawl_search — alternative web search via Firecrawl
- firecrawl_map — discover all URLs on a website
- monid_api — FALLBACK: discover and call any third-party API by describing what you need (use only when Composio/Firecrawl don't cover it)
- save_memory — persist durable context
- recall_memory — fetch prior context
- github_list_repos — enumerate Henry's repos
- github_read_file — read file or directory contents from a repo
- github_create_issue — create a repo issue
- github_list_issues — list repo issues
- github_create_branch — create a new branch off the default branch
- github_create_file — create a new file on a branch
- github_update_file — edit an existing file on a branch
- github_create_pull_request — open a PR from a head branch into base
- github_create_repo — create a brand new repository

GITHUB WRITE SAFETY RAILS — these are non-negotiable, enforced server-side:
1. NEVER commit directly to main/master. All file changes go to a new branch first, then a PR.
2. Every write tool has a "confirm" parameter. You MUST first call with confirm=false to see a preview. Present the preview to Henry. WAIT for his explicit "yes" / "go ahead" / "do it" before calling again with confirm=true. The tool returns a preview when called with confirm=false — only confirm=true actually executes.
3. You cannot delete files, force-push, delete branches, or rewrite history — those capabilities don't exist.
4. Every successful write is logged to an audit trail (github_action resource).
5. If Henry says no or asks for changes, do not execute. Adjust and re-preview.

Bound strictly to the above. If a task needs a tool not on this list, state that instead of improvising.
${focusDirective}${sessionFocusDirective}
${userProfile ? `\n${userProfile}` : ''}`,
    messages: finalMessages as any,
    stopWhen: stepCountIs(7),
    ...(reasoningDepth !== 'off' && modelSupportsReasoning(selectedModel) ? {
      providerOptions: { openai: { extra_body: { chat_template_kwargs: { enable_thinking: true } } } },
    } : {}),
    tools: allTools,
    // Inject recovery continuation into the system prompt when recovering
    // Same reasoning as the multi-skill call above: unset here defaults to
    // maxRetries 2, and this path additionally runs up to 7 tool-calling
    // steps (stopWhen) in one invocation — a broad request that triggers
    // several recall_memory/web_search/GitHub calls can legitimately run
    // 40-50s+ even on a healthy model (confirmed empirically), leaving very
    // little margin before a retry-doubled attempt blows past maxDuration.
    maxRetries: 0,
    // See the multi-skill call above — an uncapped max_tokens request
    // exceeds what the free-tier OpenRouter account (DeepSeek's provider)
    // can afford per call and fails before generating anything.
    maxOutputTokens: 4096,
    onError: ({ error }) => {
      console.error('streamText error:', error)
    },
    onFinish: async ({ usage }) => {
      // Usage observability — resilient, never breaks the response. Runs
      // after the full multi-step stream completes; usage is accumulated
      // across tool-calling steps by the SDK.
      if (uid) {
        logUsage({
          userId: uid,
          modelId: selectedModel,
          mode: 'chat',
          promptTokens: usage?.inputTokens,
          completionTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          latencyMs: Date.now() - chatStartedAt,
        }).catch(() => {})
      }
    },
  })

  return result.toUIMessageStreamResponse({
    headers: compacted ? { 'X-Context-Compacted': 'true', 'X-Context-Compacted-Summary': encodeURIComponent(compactionSummary ?? '') } : undefined,
    onError: (error) => {
      console.error('chat route error:', error)
      return error instanceof Error ? error.message : 'Something went wrong'
    },
  })
}
