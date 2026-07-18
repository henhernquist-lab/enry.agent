<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — enry.agent

Working reference for agents before touching code. Imperative, not narrative.

## Stack

- **Runtime**: Next.js 16.2.6 (App Router, Turbopack), React 19, TypeScript, pnpm
- **Styling**: Tailwind v4 (`tw-animate-css`), framer-motion, lucide-react icons
- **AI**: Vercel AI SDK 3 (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`), NVIDIA NIM (`/v1/chat/completions` only — no Responses API)
- **Backend**: Supabase + pgvector (`supabase-js`), NextAuth v5 (JWT sessions, 30-day maxAge)
- **Deploy**: Vercel, `next dev -p 8082`

### NIM Models (6)

| Model ID | Env Var |
|---|---|
| `deepseek-ai/deepseek-v4-pro` | `DEEPSEEK_API_KEY` |
| `minimax/minimax-m3` | `MINIMAX_API_KEY` |
| `qwen/qwen3.5-122b-a10b` | `QWEN_API_KEY` |
| `z-ai/glm-5.2` | `GLM_API_KEY` |
| `nvidia/nemotron-3-ultra-550b-a55b` | `NVIDIA_API_KEY` |
| `moonshotai/kimi-k2-instruct` | `MOONSHOT_API_KEY` |

All route through `nimClientFor(model)` → `createOpenAI({ baseURL: 'https://integrate.api.nvidia.com/v1', apiKey })`. New models: add entry to `MODEL_KEYS` in `src/lib/nim.ts`. Callers use `client.chat(model)`, never the bare client.

## Route Structure

```
src/app/
  page.tsx              — homepage chatbot (center-panel)
  layout.tsx            — root layout: fonts, metadata, Analytics, auth session
  template.tsx          — animated page transitions
  agent/page.tsx        — Enry Drive (coding agent, command bar, skill picker)
  lab/page.tsx          — Enry Lab (skill prompt forge, evolutionary code, overnight R&D)
  m/layout.tsx          — enry lite mobile shell (tab bar, auth guard, PWA metadata)
  m/chat/page.tsx       — enry lite chat (SSE streaming, voice input, bottom sheets)
  m/inbox/page.tsx      — alert feed
  m/status/page.tsx     — cron health
  m/tools/page.tsx      — quick actions
  settings/page.tsx     — settings (account, preferences, AI, integrations)
  resources/memory/     — Memory page (direct input, communication prefs)
  resources/[slug]/     — resource detail pages
  login/page.tsx        — auth gate
  api/                  — API routes (chat, terminal, cruise, lab, composio, memory, etc.)
```

Pattern: interactive pages are `'use client'` Server Components (not classic client boundaries). Layouts are Server Components. API routes use `auth()` from `@/lib/auth` for session checks.

## Conventions

### Auth
- NextAuth v5 JWT sessions. `session.user.id` = `profiles.google_id` (provider account ID, NOT auth.users UUID). Seven+ route files depend on this — do not change it.
- `src/lib/auth.ts`: Google, GitHub, and Credentials providers. GitHub OAuth requests `repo workflow` scope (required for Cruise dispatch). Profiles table upserted on sign-in.
- **Known inconsistency**: `profiles` table (migration 005) does NOT reference `auth.users` — it's standalone with its own `google_id` as canonical identity. Newer lab tables (skill_prompts, evolutionary_code, overnight_rd) DO reference `auth.users(id)`. Two identity systems coexist. When adding tables that need a user FK, match the surrounding migration pattern; do not retroactively "fix" existing tables.

### Session State
- `casUpdateSessionPayload()` in `src/lib/terminal/write-ops.ts`: optimistic-concurrency read-modify-write on `resources.payload`. Always use this for session payload mutations — never raw `supabase.from('resources').upsert()`. Requires migration 018 (`resources.version` column).

### Migrations
- Two naming patterns: sequential (`001_` through `018_`) and timestamp-based (`20250716120000_`).
- All live in `supabase/migrations/`. Only add new ones; never modify applied migrations.

### UI
- Dark/mono aesthetic: `#080808` base, `#3a9e60` green accent, `surface-base`/`surface-secondary`/`surface-elevated` token system. Inter + IBM Plex Mono fonts.
- `pnpm` over `npm`; Tailwind v4 (CSS-first config, no `tailwind.config.js`). All animations via framer-motion. Labels/model names in `font-mono`.

### Module Organization
- `src/lib/` — backend logic, one file per concern (e.g., `nim.ts`, `auth.ts`, `memory.ts`, `composio.ts`)
- `src/lib/cruise/` — Cruise scan-and-fix pipeline
- `src/lib/lab/` — Lab DB operations, types
- `src/lib/skills/` — skill registry, loader, definitions
- `src/lib/terminal/` — terminal execution, write-ops, diff generation, NL edit
- `src/lib/ghost/` — Ghost Mode persona/corpus

### `.enryrules`
Already wired. `loadEnryRules()` in `write-ops.ts` reads `.enryrules` from repo root via GitHub API, caches for 5 min, injects into every coding-agent prompt. Also surfaced in chat via `github_read_enryrules` tool. Adding a new prompt path that touches repo code: call `loadEnryRules(ctx)` and use `buildEnryRulesBlock(content)`.

## Hard Boundaries

**Never touch without explicit approval:**
- `src/lib/auth.ts` — auth flow. Changing JWT callbacks, provider config, or `session.user.id` semantics breaks sign-in for all routes.
- `supabase/migrations/*.sql` — applied migrations. Only add new ones. Running or modifying existing ones requires review (they may have already run in production).
- `src/lib/terminal/write-ops.ts` CONTENT_SENTINEL contract — the `===FILE===` sentinel line splits the model's plan from file content. Altering this format corrupts every code edit.
- `.env*` files — never read or print secrets. Use `freebuff-env set` to merge values blind.

**Rules:**
- SQL migrations are reviewed before running. Never auto-run or auto-push migrations without explicit go-ahead.
- Commit-not-push is the default. Only `git push` when explicitly told.
- Never rewrite git history, force-push, or use destructive reset/clean commands.
- `pnpm tsc --noEmit` must pass before every commit. Run it against the specific changed area first, then full project.

## Where Things Live

| Directory | Owns |
|---|---|
| `src/app/agent/` | Enry Drive — coding agent, skill invocation, NL edit routing |
| `src/app/lab/` | Enry Lab — skill prompt forge, evolutionary code gen, overnight R&D |
| `src/app/m/` | enry lite — mobile-optimized chat + tools |
| `src/app/api/chat/` | Main chatbot SSE streaming endpoint |
| `src/app/api/terminal/` | Live Terminal exec, NL edit dispatch |
| `src/app/api/cruise/` | Cruise scan-and-fix pipeline (GitHub Actions dispatch + ingest) |
| `src/app/api/lab/` | Lab API (review, evolve, overnight) |
| `src/app/api/composio/` | Composio Gmail + Calendar integration |
| `src/app/api/memory/` | Memory CRUD (pgvector embeddings) |
| `src/components/` | Shared UI (center-panel, left-sidebar, thinking-trace, etc.) |
| `src/components/home/` | Homepage-specific (system-status-strip, today-band) |
| `src/components/mobile/` | enry lite components (BottomSheet, MobileNav) |
| `src/components/terminal/` | Live Terminal UI (diff-view, live-terminal, terminal-chat) |
| `src/components/tools/` | Tool panel widgets (workout-logger, grade-calculator, etc.) |
| `overnight-runner/` | Self-contained Node.js runner dispatched to scratch repos for overnight R&D |
