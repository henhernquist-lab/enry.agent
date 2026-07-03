> **This is NOT the Next.js you know.** APIs, conventions, and file structure may differ from training data. Read `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

## What this is

enry.agent is Henry's personal AI superagent — Next.js chat UI over NVIDIA NIM frontier models. One user. Optimize everything for him.

## Stack

| Layer | Package / version |
|---|---|
| Framework | Next.js 16.2.6, App Router, Turbopack |
| UI | React 19, TypeScript, Tailwind v4, Framer Motion |
| AI SDK | `ai`, `@ai-sdk/react`, `@ai-sdk/openai` (Vercel AI SDK v3) |
| Backend | NVIDIA NIM — `https://integrate.api.nvidia.com/v1` |
| Package manager | pnpm |

## Models & keys

| Model ID | Label | Env var |
|---|---|---|
| `deepseek-ai/deepseek-v4-pro` | DeepSeek V4 Pro (default) | `DEEPSEEK_API_KEY` |
| `minimax/minimax-m3` | MiniMax M3 | `MINIMAX_API_KEY` |
| `qwen/qwen3.5-122b-a10b` | Qwen 3.5 122B | `QWEN_API_KEY` |
| `z-ai/glm-5.2` | GLM 5.2 | `GLM_API_KEY` |

Verify IDs against `GET /v1/models` before hardcoding — NIM model names don't match training data.

## Streaming pipeline

```
useChat (frontend)
  → DefaultChatTransport → POST /api/chat
      → await convertToModelMessages(messages)   ← must await!
      → streamText({ model: client.chat(id) })   ← .chat(), not client() directly
      → toUIMessageStreamResponse()
```

Model is sent via `sendMessage({ text }, { body: { model } })` and read from `req.json()`.

## Hard-won gotchas

- **`await convertToModelMessages`** — it's async. Skip the await and `streamText` receives a Promise; you get `messages.some is not a function`.
- **`client.chat(model)`** — `@ai-sdk/openai` v3 defaults to the Responses API (`/v1/responses`). NIM doesn't support that. Must call `.chat()` explicitly to hit `/v1/chat/completions`.
- **Per-model keys** — each model has its own env var. Never collapse them into a single key.
- **Env var restarts** — `.env.local` changes don't hot-reload. Restart the dev server.
- **Test streaming correctly** — check for `"type":"text-delta"` events, not just absence of `errorText`.

## Dark matrix UI

Design tokens (never use raw Tailwind colors):
`surface-base` · `surface-secondary` · `surface-elevated` · `border` · `primary` (green accent) · `muted-foreground` · `accent` · `warning`

Patterns:
- Framer Motion for all animations — smooth, intentional, 60fps
- Dropdowns open upward when near the bottom of the viewport
- Dropdowns need click-outside close: `mousedown` listener on `document`, scoped to a `ref`
- `font-mono` for labels, model names, stat values

## Code standards

**Before touching a file:** read it, read its neighbors, match conventions exactly.

**TypeScript:** strict throughout; no `any` unless fighting a library type; check `package.json` before assuming a package exists.

**Comments:** only when the WHY is non-obvious — a hidden constraint, a workaround, a subtle invariant. Never describe what the code does.

**API routes:**
- Validate model IDs against an allowlist before passing to the provider
- Always stream or return structured errors — never bare throws
- `export const maxDuration = 30` on all streaming routes

**Shipping checklist:**
1. `npx tsc --noEmit` passes
2. Dev server starts clean
3. Test the actual stream (not just compile)
4. Don't commit or push unless Henry asks
