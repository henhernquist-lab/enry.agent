import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { tavily } from '@tavily/core'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { saveMemory, searchMemories } from '@/lib/memory'
import { listRepos, listIssues, createIssue, getFileContent } from '@/lib/github'
import { createBranch, createFile, updateFile, createPR, createRepo } from '@/lib/github-write'
import { resolveResourceUserId } from '@/lib/resource-user'
import { supabase } from '@/lib/supabase'
import type { GitHubActionPayload } from '@/lib/resources'

const MODEL_CONFIG = {
  'deepseek-ai/deepseek-v4-pro': () => process.env.DEEPSEEK_API_KEY ?? '',
  'minimax/minimax-m3':           () => process.env.MINIMAX_API_KEY ?? '',
  'qwen/qwen3.5-122b-a10b':      () => process.env.QWEN_API_KEY ?? '',
  'z-ai/glm-5.2':                () => process.env.GLM_API_KEY ?? '',
} as const

type AllowedModel = keyof typeof MODEL_CONFIG
const ALLOWED_MODELS = Object.keys(MODEL_CONFIG) as AllowedModel[]
const DEFAULT_MODEL: AllowedModel = 'deepseek-ai/deepseek-v4-pro'

export const maxDuration = 60

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY ?? '' })

export async function POST(req: Request) {
  const { messages, model, userProfile } = await req.json()
  const selectedModel: AllowedModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL
  const apiKey = MODEL_CONFIG[selectedModel]()

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: `No API key configured for ${selectedModel}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const session = await auth()
  const googleId    = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    console.warn('[chat/route] Could not resolve user UUID for audit trail — googleId:', googleId)
  }

  const modelMessages = await convertToModelMessages(messages)

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  const result = streamText({
    model: client.chat(selectedModel),
    system: `You are enry.agent — Henry's personal AI superagent. You are NOT a generic conversational assistant, NOT ChatGPT, NOT Claude, NOT a chatbot. You are Henry's locked-in engineering collaborator, research partner, and executor.

You exist to move Henry's work forward: shipping features on the enry.agent codebase itself, answering technical questions with real research, running tool-calling loops on his behalf, and remembering context across sessions so he never has to re-explain his stack.

You are built on a Next.js + TypeScript + Supabase + NVIDIA NIM stack, running on Vercel. You have access to a pgvector-backed memory layer with bge-m3 embeddings, a resources table that stores everything Henry saves across 14+ tools, and web search via Tavily. You know this because you ARE this system — not a wrapper on it.

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
Follow the established stack: Next.js 16, TypeScript, pnpm, Supabase with pgvector + RLS, NextAuth v5, NVIDIA NIM (DeepSeek V4 Pro default, MiniMax M3, Qwen 3.5 122B, GLM 5.2), bge-m3 embeddings, Vercel deployment, Tavily search.
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
- web_search — real-time queries via Tavily
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

${userProfile ? `\n${userProfile}` : ''}`,
    messages: modelMessages,
    stopWhen: stepCountIs(7),
    tools: {
      web_search: tool({
        description: 'Search the web for current, real-time information. Use this for news, prices, recent events, people, or anything that may have changed.',
        inputSchema: z.object({
          query: z.string().describe('The search query'),
          max_results: z.number().optional().default(5).describe('Number of results to return'),
        }),
        execute: async ({ query, max_results }) => {
          const response = await tavilyClient.search(query, {
            maxResults: max_results,
            includeAnswer: true,
          })
          return {
            answer: response.answer,
            results: response.results.map(r => ({
              title: r.title,
              url: r.url,
              content: r.content,
            })),
          }
        },
      }),

      save_memory: tool({
        description: 'Save an important fact about the user to long-term memory. Use this when the user shares personal goals, PRs, preferences, schedules, important events, or anything worth remembering for future conversations.',
        inputSchema: z.object({
          content: z.string().describe('The fact or information to remember about the user'),
        }),
        execute: async ({ content }) => {
          if (!googleId) {
            return { success: false, error: 'Not authenticated — cannot save memory.' }
          }
          const result = await saveMemory(googleId, content)
          if (result.error) {
            return { success: false, error: result.error }
          }
          return { success: true, id: result.id, content }
        },
      }),

      recall_memory: tool({
        description: "Search the user's long-term memory for relevant past information. Use this before answering personalized questions about the user's goals, preferences, history, or past conversations.",
        inputSchema: z.object({
          query: z.string().describe('What to search for in memory'),
          limit: z.number().optional().default(5).describe('Maximum number of results to return'),
        }),
        execute: async ({ query, limit }) => {
          if (!googleId) {
            return { results: [], error: 'Not authenticated — cannot search memory.' }
          }
          const result = await searchMemories(googleId, query, limit)
          if (result.error) {
            return { results: [], error: result.error }
          }
          return { results: result.results }
        },
      }),

      github_list_repos: tool({
        description: "List Henry's GitHub repositories. Use when he asks what repos he has or needs to pick one for another task.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!githubToken) {
            return { repos: [], error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          const { repos, error } = await listRepos(githubToken)
          if (error) return { repos: [], error }
          return {
            repos: repos.map(r => ({
              name: r.full_name,
              private: r.private,
              description: r.description,
              language: r.language,
              stars: r.stargazers_count,
              updated_at: r.updated_at,
              url: r.html_url,
            })),
          }
        },
      }),

      github_read_file: tool({
        description: 'Read a file from a GitHub repo, or list directory contents if a path points to a folder.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner (username or org)'),
          repo:  z.string().describe('Repository name (without owner prefix)'),
          path:  z.string().describe('File or directory path within the repo, e.g. "src/index.ts" or "src/"'),
        }),
        execute: async ({ owner, repo, path }) => {
          if (!githubToken) {
            return { content: null, error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          const { content, error } = await getFileContent(githubToken, owner, repo, path)
          if (error) return { content: null, error }
          // Truncate very large files to avoid blowing the context window
          const truncated = content && content.length > 20000
            ? content.slice(0, 20000) + `\n\n[… truncated at 20 000 chars — ${content.length} total]`
            : content
          return { content: truncated }
        },
      }),

      github_create_issue: tool({
        description: 'Create a new GitHub issue on a repository.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner'),
          repo:  z.string().describe('Repository name'),
          title: z.string().describe('Issue title'),
          body:  z.string().describe('Issue body (markdown supported)'),
        }),
        execute: async ({ owner, repo, title, body }) => {
          if (!githubToken) {
            return { issue: null, error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          const { issue, error } = await createIssue(githubToken, owner, repo, title, body)
          if (error) return { issue: null, error }
          return { issue: { number: issue!.number, title: issue!.title, url: issue!.html_url } }
        },
      }),

      github_list_issues: tool({
        description: 'List open issues on a GitHub repository.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner'),
          repo:  z.string().describe('Repository name'),
        }),
        execute: async ({ owner, repo }) => {
          if (!githubToken) {
            return { issues: [], error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          const { issues, error } = await listIssues(githubToken, owner, repo)
          if (error) return { issues: [], error }
          return {
            issues: issues.map(i => ({
              number: i.number,
              title:  i.title,
              labels: i.labels.map(l => l.name),
              created_at: i.created_at,
              url: i.html_url,
            })),
          }
        },
      }),

      // ─── GitHub write tools ──────────────────────────────────

      github_create_branch: tool({
        description: 'Create a new branch off the default branch. Use before making file changes — never commit directly to main/master.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          branch_name: z.string().describe('Name of the new branch, e.g. "fix/readme-typo"'),
          confirm: z.boolean().describe('Set to false first to preview the action. Only set to true after Henry explicitly confirms.'),
        }),
        execute: async ({ owner, repo, branch_name, confirm }) => {
          if (!githubToken) {
            return { status: 'error', error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          if (!confirm) {
            return {
              status: 'preview',
              action: 'create_branch',
              repo: `${owner}/${repo}`,
              branch: branch_name,
              summary: `Create branch "${branch_name}" off the default branch in ${owner}/${repo}.`,
            }
          }
          const result = await createBranch(githubToken, owner, repo, branch_name)
          if (!result.ok) return { status: 'error', error: result.error }
          // Audit trail
          if (uid) {
            const payload: GitHubActionPayload = { action: 'create_branch', repo: `${owner}/${repo}`, branch: branch_name, summary: `Created branch "${branch_name}"`, timestamp: new Date().toISOString() }
            ;(async () => {
              const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Branch: ${branch_name}`, payload })
              if (auditError) console.error('[chat] audit insert failed:', auditError)
            })()
          }
          return { status: 'ok', repo: `${owner}/${repo}`, branch: branch_name }
        },
      }),

      github_create_file: tool({
        description: 'Create a new file in a GitHub repo on a branch. Never create files directly on main/master — always use a feature branch.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path within the repo, e.g. "src/utils/helpers.ts"'),
          content: z.string().describe('Full file contents'),
          message: z.string().describe('Commit message describing the change'),
          branch: z.string().describe('Branch to commit to (NOT main/master)'),
          confirm: z.boolean().describe('Set to false first to preview the action. Only set to true after Henry explicitly confirms.'),
        }),
        execute: async ({ owner, repo, path, content, message, branch, confirm }) => {
          if (!githubToken) {
            return { status: 'error', error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          if (!confirm) {
            return {
              status: 'preview',
              action: 'create_file',
              repo: `${owner}/${repo}`,
              branch,
              file_path: path,
              content_summary: content.slice(0, 500) + (content.length > 500 ? '…' : ''),
              message,
              summary: `Create "${path}" on branch "${branch}" in ${owner}/${repo}.`,
            }
          }
          const result = await createFile(githubToken, owner, repo, path, content, message, branch)
          if (!result.ok) return { status: 'error', error: result.error }
          if (uid) {
            const payload: GitHubActionPayload = { action: 'create_file', repo: `${owner}/${repo}`, branch, file_path: path, summary: `Created "${path}" on "${branch}"`, timestamp: new Date().toISOString() }
            ;(async () => {
              const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Create: ${path}`, payload })
              if (auditError) console.error('[chat] audit insert failed:', auditError)
            })()
          }
          return { status: 'ok', repo: `${owner}/${repo}`, branch, file_path: path, url: result.url }
        },
      }),

      github_update_file: tool({
        description: 'Edit an existing file in a GitHub repo on a branch. Requires the file to exist. Never update files on main/master — always use a feature branch.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path to update'),
          content: z.string().describe('Replacement file contents (the complete file, not a diff)'),
          message: z.string().describe('Commit message describing the change'),
          branch: z.string().describe('Branch to commit to (NOT main/master)'),
          confirm: z.boolean().describe('Set to false first to preview the action. Only set to true after Henry explicitly confirms.'),
        }),
        execute: async ({ owner, repo, path, content, message, branch, confirm }) => {
          if (!githubToken) {
            return { status: 'error', error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          if (!confirm) {
            return {
              status: 'preview',
              action: 'update_file',
              repo: `${owner}/${repo}`,
              branch,
              file_path: path,
              content_summary: content.slice(0, 500) + (content.length > 500 ? '…' : ''),
              message,
              summary: `Update "${path}" on branch "${branch}" in ${owner}/${repo}.`,
            }
          }
          const result = await updateFile(githubToken, owner, repo, path, content, message, branch)
          if (!result.ok) return { status: 'error', error: result.error }
          if (uid) {
            const payload: GitHubActionPayload = { action: 'update_file', repo: `${owner}/${repo}`, branch, file_path: path, summary: `Updated "${path}" on "${branch}"`, timestamp: new Date().toISOString() }
            ;(async () => {
              const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Update: ${path}`, payload })
              if (auditError) console.error('[chat] audit insert failed:', auditError)
            })()
          }
          return { status: 'ok', repo: `${owner}/${repo}`, branch, file_path: path, url: result.url }
        },
      }),

      github_create_pull_request: tool({
        description: 'Open a pull request from a working branch into base (usually main). Use after making file changes on a branch.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          title: z.string().describe('PR title'),
          body: z.string().describe('PR description (markdown supported)'),
          head_branch: z.string().describe('Source branch with the changes'),
          base_branch: z.string().default('main').describe('Target branch, usually main'),
          confirm: z.boolean().describe('Set to false first to preview the action. Only set to true after Henry explicitly confirms.'),
        }),
        execute: async ({ owner, repo, title, body, head_branch, base_branch, confirm }) => {
          if (!githubToken) {
            return { status: 'error', error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          if (!confirm) {
            return {
              status: 'preview',
              action: 'create_pr',
              repo: `${owner}/${repo}`,
              title,
              body,
              head: head_branch,
              base: base_branch,
              summary: `Open PR: "${title}" from "${head_branch}" → "${base_branch}" in ${owner}/${repo}.`,
            }
          }
          const result = await createPR(githubToken, owner, repo, title, body, head_branch, base_branch)
          if (!result.ok) return { status: 'error', error: result.error }
          if (uid) {
            const payload: GitHubActionPayload = { action: 'create_pr', repo: `${owner}/${repo}`, branch: head_branch, pr_url: result.url, summary: `Opened PR #${result.number}: "${title}"`, timestamp: new Date().toISOString() }
            ;(async () => {
              const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `PR #${result.number}: ${title}`, payload })
              if (auditError) console.error('[chat] audit insert failed:', auditError)
            })()
          }
          return { status: 'ok', repo: `${owner}/${repo}`, pr_url: result.url, number: result.number, head: head_branch, base: base_branch }
        },
      }),

      github_create_repo: tool({
        description: 'Create a brand new GitHub repository under Henry\'s account. Always requires confirmation — repos are permanent.',
        inputSchema: z.object({
          name: z.string().describe('Repository name'),
          description: z.string().describe('Short repo description'),
          private: z.boolean().default(true).describe('Make the repo private? Default true.'),
          confirm: z.boolean().describe('Set to false first to preview the action. Only set to true after Henry explicitly confirms.'),
        }),
        execute: async ({ name, description, private: isPrivate, confirm }) => {
          if (!githubToken) {
            return { status: 'error', error: 'GitHub not connected. Sign in with GitHub at /login to enable this.' }
          }
          if (!confirm) {
            return {
              status: 'preview',
              action: 'create_repo',
              name,
              description,
              private: isPrivate,
              summary: `Create ${isPrivate ? 'private' : 'public'} repo "${name}": ${description || '(no description)'}.`,
            }
          }
          const result = await createRepo(githubToken, name, description, isPrivate)
          if (!result.ok) return { status: 'error', error: result.error }
          if (uid) {
            const payload: GitHubActionPayload = { action: 'create_repo', repo: name, summary: `Created ${isPrivate ? 'private' : 'public'} repo "${name}"`, timestamp: new Date().toISOString() }
            ;(async () => {
              const { error: auditError } = await supabase.from('resources').insert({ user_id: uid, type: 'github_action', source: 'user', title: `Repo: ${name}`, payload })
              if (auditError) console.error('[chat] audit insert failed:', auditError)
            })()
          }
          return { status: 'ok', name, url: result.url, private: isPrivate }
        },
      }),
    },
    onError: ({ error }) => {
      console.error('streamText error:', error)
    },
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('chat route error:', error)
      return error instanceof Error ? error.message : 'Something went wrong'
    },
  })
}