# Repo Reviewer — Issue Classification Taxonomy

> Reference taxonomy for the Repo Reviewer tool's AI-generated code review output.
> Defines severity levels, issue categories, the output JSON schema, and quality
> guidance for producing actionable suggestions rather than vague advice.

---

## 1. Severity Levels

Severity communicates **impact × likelihood** — how badly could this go wrong, and how likely is it to?

### HIGH

Issues that will or are very likely to cause a production bug, data loss, security vulnerability, or broken build. These should block a merge.

**What qualifies:**
- Exposed secrets, API keys, or credentials in client code
- SQL injection, XSS, or unvalidated user input reaching a database query
- Missing auth checks on a route that accesses user data
- Unhandled promise rejection in a critical path (data fetch, payment)
- Logic that produces incorrect results under normal conditions
- `any` cast masking a type error that would catch a real bug
- Route handler returning 200 on error (swallowing failures silently)

**Examples:**
- A `POST /api/resources` route has no auth check — any unauthenticated user can write to the database.
- `process.env.OPENAI_API_KEY` is passed to a `'use client'` component as a prop.
- `fetch(url)` without `.catch()` inside a `try` block — network failures are silently swallowed.

**Heuristic:** If you saw this in a PR, would you block the merge? Yes → HIGH.

---

### MEDIUM

Issues that degrade code quality, create maintenance risk, or represent a missed best practice that will likely cause problems later. These **should** be fixed but won't immediately crash production.

**What qualifies:**
- N+1 queries that work now but will degrade under load
- Missing error boundaries around async client components
- `useEffect` with a missing or incorrect dependency array
- Duplicated logic across 2+ files that should share a helper
- Components exceeding 200+ lines without clear separation of concerns
- Hardcoded values where a config/env variable belongs
- Inefficient re-renders from a missing `useMemo`/`useCallback` on a hot path
- Client component importing a server-only module (works in dev, fails in build)

**Examples:**
- A component maps over `items` and calls `fetch` per item instead of batching into one request.
- A form component has the same 40-line validation function copy-pasted into 3 different route handlers.
- `useEffect(() => { fetchData(id) }, [])` — missing `id` in the dependency array, stale data after prop change.

**Heuristic:** Would you leave a comment on the PR asking them to fix this before the next iteration? Yes → MEDIUM.

---

### LOW

Minor style drift, readability improvements, or opportunities for better naming. These are nice-to-haves — fix them opportunistically, not urgently.

**What qualifies:**
- Inconsistent naming conventions within a file (camelCase vs snake_case drift)
- Missing or outdated JSDoc on an exported function
- Unused import that `eslint` didn't catch
- Magic number that could be a named constant (but isn't changing behavior)
- A comment that's become stale (describes old behavior)
- `console.log` left in from debugging (not in a critical path)
- Import order inconsistent with the project's convention

**Examples:**
- A function called `getData` when every other data-fetching function in the project is named `fetch*`.
- `const TIMEOUT = 5000` defined inline in 3 files instead of a shared constant — same value, no bug, just duplication.
- A `// TODO: fix this` comment from 3 months ago with no ticket reference.

**Heuristic:** Would you fix this if you were already editing the file for another reason? Yes → LOW.

---

### Edge Cases & Tiebreakers

| Scenario | Severity | Reasoning |
|----------|----------|-----------|
| `any` cast on a line that's never executed | LOW | No runtime impact; clean up when touched |
| `any` cast that bypasses a validation check | HIGH | Masks a real type error that could let bad data through |
| Missing error handling in a cron job | HIGH | Cron failures are silent — no user sees the error |
| Missing error handling in a UI tooltip | LOW | Tooltip failure doesn't affect core functionality |
| Duplicated 5-line utility | LOW | Small enough to not create maintenance risk |
| Duplicated 40-line validation | MEDIUM | Bug fix in one copy won't propagate to others |

---

## 2. Issue Categories

Categories describe **what kind of problem** this is. An issue gets exactly one primary category. If it straddles two, pick the more dangerous one.

### SECURITY

Code that creates a vulnerability — unauthorized access, data leaks, injection attacks, or exposed credentials.

**Defining trait:** This code could be exploited by a malicious actor.

**Examples:**
- API key or secret token in client-side code (visible in browser devtools)
- SQL query built with string interpolation of user input (`SELECT * FROM users WHERE id = '${req.query.id}'`)
- Auth-protected route handler that checks the session but doesn't verify the user owns the resource being accessed
- `dangerouslySetInnerHTML` with unsanitized user content
- `redirect()` to a URL from `req.nextUrl.searchParams` without validation (open redirect)

**What's NOT security:**
- A route with no auth check where the data is intentionally public (e.g., a public leaderboard) → ARCHITECTURE if the design should be reconsidered, otherwise no issue.

---

### ARCHITECTURE

Code that is structurally sound but **placed wrong**, uses the wrong pattern for the framework, or creates coupling that will cause pain as the codebase grows.

**Defining trait:** This works now, but the design decision will cause cascading problems.

**Examples:**
- Server-only module (`fs`, `child_process`) imported in a `'use client'` component — works in dev, fails at build
- Database query inside a React component render function instead of a server component or route handler
- Fetching the same data in 4 sibling components instead of lifting to a parent or using a shared hook
- Using `useState` + `useEffect` for data fetching in Next.js 14+ where a Server Component with `async` would be simpler and faster
- A 600-line page component that mixes data fetching, UI rendering, form logic, and validation — should be split into server component, client form, and validation helper
- Circular import dependency between two modules that currently loads due to import order luck
- Props drilling through 4+ layers of components when a context or composition pattern would be cleaner

**What's NOT architecture:**
- A function that's a bit too long → CODE_SMELL
- An unused import → DEAD_CODE

---

### CODE_SMELL

Code that functions correctly but exhibits patterns known to cause bugs or confuse future readers. These are symptoms of a deeper design issue.

**Defining trait:** This isn't technically broken, but it's a bug waiting to happen or a maintenance trap.

**Examples:**
- `useEffect` with missing dependencies in the dependency array (stale closure bug risk)
- Mutating state directly (`state.items.push(x)`) instead of using the setter
- Using index as `key` in a list where items can be reordered, added, or removed
- Boolean trap: `fetchUsers(true)` where `true` means "include archived" — caller can't tell what the argument does
- Function with 8+ parameters — easy to swap arguments by mistake
- `try { ... } catch (e) { }` — silently swallowing errors with no logging
- Promise chain without a `.catch()` in a non-async context
- Object with 3+ optional boolean flags controlling behavior (`{ showHeader: true, isCompact: false, useLegacy: true }`) — use a discriminated union or strategy pattern instead

**What's NOT code-smell:**
- A function that's intentionally long because extracting helpers would reduce clarity → leave it alone (not an issue)
- A `// eslint-disable` with a comment explaining why → acceptable, not a smell

---

### DEAD_CODE

Code that is never executed, never imported, or has been superseded but not removed.

**Defining trait:** Deleting this code changes nothing about how the application runs.

**Examples:**
- Exported function that is never imported anywhere in the project (verify with `rg` search)
- Component file that is no longer referenced in any page or layout
- `return` statement after a `throw` — unreachable
- Variable assigned but never read
- Commented-out block of code with no explanation of why it was kept
- Conditional branch that can never be reached (`if (true)` or `if (false)`)
- CSS class defined but never used in any component
- Route handler file left behind after the corresponding page was deleted

**What's NOT dead code:**
- A utility function exported from a library/index barrel that's part of the public API (even if no current internal consumer) → not dead, it's the API surface
- Code behind a feature flag that's currently off → not dead, it's intentionally dormant

---

### INCONSISTENCY

Code that breaks the established conventions of the project — naming, file structure, error handling patterns, import order.

**Defining trait:** The code works, but it's different from everything around it in a way that confuses readers.

**Examples:**
- New file uses default exports when every other file in `src/app/api/` uses named exports
- Error responses in a new route return `{ error: string }` when all other routes return `{ message: string }`
- Tailwind classes ordered differently than the project's established pattern (e.g., layout → spacing → color vs random order)
- A component uses `fetch` directly when every other data-fetching component uses a shared `apiClient` wrapper
- `snake_case` variable names in a TypeScript file where the entire project uses `camelCase`
- New route uses `Response.json()` pattern when all existing routes use `NextResponse.json()`
- Test file uses `describe`/`it` when the project convention is `test.each`

**What's NOT inconsistency:**
- A one-off justified deviation with an explanatory comment → intentional, not an issue
- A new pattern that improves on the old convention (e.g., migrating from `useState` to `useReducer` for complex state) → ARCHITECTURE if the old pattern should also migrate, otherwise acceptable

---

### Category Tiebreakers

| If the issue is both... | Pick... | Because... |
|--------------------------|---------|------------|
| SECURITY + CODE_SMELL | SECURITY | Security always takes priority |
| DEAD_CODE + INCONSISTENCY | DEAD_CODE | Dead code is objectively removable; inconsistency is subjective |
| ARCHITECTURE + CODE_SMELL | ARCHITECTURE | A misplaced abstraction is more expensive than a local pattern issue |
| CODE_SMELL + INCONSISTENCY | CODE_SMELL | A smell can cause bugs; inconsistency alone won't |

---

## 3. Output JSON Schema

Every issue the reviewer reports must follow this exact shape. The `suggestion` field is the most important — a vague suggestion is worse than no suggestion (see Section 4).

```json
{
  "file": "string — path relative to project root (e.g. 'src/app/api/resources/route.ts')",
  "line": "number — line where the issue starts (use the most relevant line, not the function declaration)",
  "severity": "'high' | 'medium' | 'low'",
  "category": "'security' | 'architecture' | 'code_smell' | 'dead_code' | 'inconsistency'",
  "title": "string — one-line summary, under 80 chars. Reads like a bug title (e.g. 'API key exposed in client component')",
  "description": "string — 1-3 sentences explaining what's wrong and the concrete risk. No jargon without explanation.",
  "suggestion": "string — specific fix with file paths, function names, or code sketch. Must be actionable by someone who didn't write the code."
}
```

### Five Fully-Written Examples

These cover different severity/category combinations using realistic Next.js/TypeScript scenarios. Use these as few-shot examples in the model's system prompt.

---

**Example 1:** HIGH / SECURITY

```json
{
  "file": "src/components/tools/github.tsx",
  "line": 45,
  "severity": "high",
  "category": "security",
  "title": "GitHub personal access token passed to client component",
  "description": "The `GITHUB_TOKEN` environment variable is passed as a prop to a `'use client'` component. This token will be bundled into the client-side JavaScript and visible in browser devtools to any user. An attacker could extract it to make authenticated GitHub API requests.",
  "suggestion": "Remove the token prop from the client component. Instead, move the GitHub API call to a server-side API route at `src/app/api/tools/github/route.ts`. The client component should call `fetch('/api/tools/github', { method: 'POST', body: JSON.stringify({ repo }) })`. In the route handler, access `process.env.GITHUB_TOKEN` server-side where it cannot leak."
}
```

---

**Example 2:** HIGH / CODE_SMELL

```json
{
  "file": "src/app/api/resources/route.ts",
  "line": 28,
  "severity": "high",
  "category": "code_smell",
  "title": "Unhandled promise rejection in POST handler silently drops errors",
  "description": "The `fetch` call to Supabase inside the POST handler has no `.catch()` and is not awaited inside the `try` block (it's fire-and-forget passed to a `Promise.all` that is never checked). If Supabase returns a 500 or the network fails, the error is silently swallowed and the handler returns a 200 with stale data.",
  "suggestion": "Wrap the Supabase call in the existing `try/catch` block on line 25. Move `await supabase.from('resources').insert(...)` to a `const { error } = await ...` pattern and check `if (error) throw error`. This ensures the handler returns a 500 with the error message instead of silently succeeding."
}
```

---

**Example 3:** MEDIUM / ARCHITECTURE

```json
{
  "file": "src/components/tools/race-pace-calculator.tsx",
  "line": 120,
  "severity": "medium",
  "category": "architecture",
  "title": "Calculator logic and UI rendering mixed in a single 300-line client component",
  "description": "The `computeSplits`, `parseTime`, and `buildPaceCards` functions are pure logic with no React dependencies, but they live inside a `'use client'` component file. This means they can't be tree-shaken, can't be tested in isolation, and can't be reused by the hypothetical `/api/calculate-pace` route without duplicating code.",
  "suggestion": "Extract `parseTime`, `fmtSecs`, `computeSplits`, and `buildPaceCards` into a new file `src/lib/race-pace.ts`. Export them as named exports. Update the component to `import { parseTime, computeSplits } from '@/lib/race-pace'`. This lets you write unit tests for the split math independently of the component, and makes the functions available for server-side use."
}
```

---

**Example 4:** MEDIUM / DEAD_CODE

```json
{
  "file": "src/lib/resource-user.ts",
  "line": 42,
  "severity": "medium",
  "category": "dead_code",
  "title": "Exported `getResourceUserId` is never called anywhere in the project",
  "description": "A `rg` search for `getResourceUserId` returns only this file's definition and export. The function was likely used by a route that has since been deleted (`src/app/api/user-resources/` no longer exists). Keeping it creates confusion — a future developer may try to use it without realizing it references a deprecated table schema.",
  "suggestion": "Delete the `getResourceUserId` function and its export from `src/lib/resource-user.ts`. If the logic may be needed later, copy the function body into a comment in the relevant Notion doc or ticket, but remove it from the codebase. Also check whether the Supabase `user_resources` table still exists — if not, the migration that created it should also be cleaned up."
}
```

---

**Example 5:** LOW / INCONSISTENCY

```json
{
  "file": "src/app/api/article-notes/route.ts",
  "line": 15,
  "severity": "low",
  "category": "inconsistency",
  "title": "Error response shape doesn't match the project convention",
  "description": "Every other API route in `src/app/api/` returns errors as `NextResponse.json({ message: string }, { status: number })`. This route returns `NextResponse.json({ error: string }, { status: number })` — a different key name. This means client-side error handling code written for the `message` key silently breaks when calling this endpoint.",
  "suggestion": "Change `{ error: 'Invalid time' }` to `{ message: 'Invalid time — use e.g. 53.00 or 1:53.45' }` on line 15 to match the pattern in `src/app/api/resources/route.ts` and `src/app/api/prompts/search/route.ts`. If you want to include both keys for backward compatibility during migration, use `{ message: '...', error: '...' }` and file a follow-up ticket to remove the `error` key in the next sprint."
}
```

---

## 4. Good Suggestions vs. Vague Suggestions

The `suggestion` field is what makes a review actionable. A reviewer that says "fix this" without saying how is worse than no reviewer — it creates work without providing direction. The model must produce **concrete, copyable, path-aware suggestions**.

### The VAGUE → GOOD Spectrum

| Vague ❌ | Good ✅ | Why it's better |
|----------|---------|-----------------|
| "Extract this into a separate function." | "Extract lines 42–58 into `validateRaceTime(input: string): number \| null` in a new file `src/lib/validation.ts`. Import it from the three route handlers that currently duplicate this logic: `resources/route.ts`, `prompts/search/route.ts`, and `article-notes/route.ts`." | Names the function, gives its signature, specifies the file path, and lists the consumers that should be updated. |
| "Add error handling." | "Wrap the `fetch` call on line 32 in a `try/catch`. On error, return `NextResponse.json({ message: 'Failed to load data — try again' }, { status: 500 })`. Also surface this error to the caller by checking `res.ok` before calling `res.json()`." | Specifies the exact error handling pattern, the HTTP status code, the error message text, and the caller-side fix. |
| "Use a proper type here." | "Replace `const data: any = await res.json()` on line 28 with `const data = await res.json() as { resources: Resource[] }`. If the API can return other shapes, define a discriminated union: `type ApiResponse = \| { resources: Resource[] } \| { error: string }`." | Shows the exact type to use, acknowledges the possibility of multiple response shapes, and suggests a discriminated union pattern. |
| "Refactor this to be more readable." | "The conditional chain on lines 55–72 handles 5 different `resource.type` values. Replace with a `RESOURCE_HANDLERS: Record<string, (resource: Resource) => JSX.Element>` lookup object. This eliminates the nested ternaries and makes adding a new resource type a one-line addition to the record." | Proposes a specific pattern (lookup object), names it, and explains the maintenance benefit. |
| "Move this to a server component." | "This `'use client'` component only uses client features for the `onClick` handler on line 78. Convert it to a Server Component (remove `'use client'` directive) and extract just the button into a thin `'use client'` wrapper: `src/components/tools/save-button.tsx`. The parent component can `await` the data fetch directly." | Identifies exactly what requires client features, proposes the file to extract, and specifies the architectural split. |

### Three Rules for Good Suggestions

**1. Be path-aware.** Always specify the exact file path where code should be created, moved, or edited. Use paths relative to the project root.

**2. Show the shape.** For new functions, give the signature. For new files, describe what they export. For pattern changes, show the before/after structure (pseudocode is fine).

**3. Close the loop.** If a change affects other files (e.g., extracting a function means updating imports), list those files explicitly. A suggestion that says "extract this" without saying "and update these 3 callers" is incomplete.

### When a Suggestion Should Be OMITTED

Not every issue needs a suggestion. Skip the `suggestion` field (use `null`) when:

- The fix is genuinely obvious from the title and description (e.g., "Unused import of `fs` on line 3" → just delete it)
- The issue is a flag for human judgment (e.g., "This regex could be simplified but the current version is more readable — team call")
- The reviewer can't determine the right fix without more context (e.g., "This component uses a deprecated API but the replacement depends on a product decision")

In these cases, set `suggestion: null` and make the `description` field clear enough that the reader can decide.

---

## 5. Model Prompt Integration

When used as few-shot examples in a system prompt, include the taxonomy as a condensed preamble followed by all 5 examples:

```
You are a code reviewer analyzing a {LANGUAGE} codebase. Classify each issue you find using this taxonomy:

SEVERITY:
- high: Will cause a bug, security vulnerability, or broken build. Block merge.
- medium: Creates maintenance risk or missed best practice. Should fix before next iteration.
- low: Style drift, readability, naming. Opportunistic cleanup.

CATEGORIES:
- security: Exploitable vulnerability or exposed credentials
- architecture: Wrong pattern, wrong place, creates coupling
- code_smell: Works but is a bug waiting to happen
- dead_code: Never executed, never imported, never used
- inconsistency: Breaks established project conventions

Output each issue in this exact JSON shape:
{"file": "...", "line": N, "severity": "...", "category": "...", "title": "...", "description": "...", "suggestion": "..."}

The suggestion field is the most important. Be specific: name the function to extract, the file to create, the pattern to use. Never say "fix this" without saying how.

Here are 5 examples of correct output:

[INSERT THE 5 EXAMPLES FROM SECTION 3]

Now review the following code: {CODE_OR_DIFF}
```

---

## 6. Anti-Patterns — What NOT to Flag

Not everything that looks different is an issue. These should NOT be flagged:

| What it looks like | Why it's NOT an issue |
|--------------------|----------------------|
| `// eslint-disable-next-line` with a comment explaining why | Intentional suppression for a known reason |
| A `.catch(() => {})` on a fire-and-forget analytics call | Analytics failures shouldn't break the app — this is correct |
| `any` used in a generic constraint like `extends Record<string, any>` | Sometimes `any` in a generic bound is the correct escape hatch |
| A component with no tests | Test coverage is a separate concern from code quality — don't flag missing tests unless there's an established testing convention being broken |
| A long function that reads linearly with clear section comments | Length alone is not a smell — flag only when sections have unrelated concerns |
| A one-off `style` prop instead of Tailwind | Sometimes inline styles are the right tool (dynamic values, canvas positioning) |
| A comment that says "HACK:" or "WORKAROUND:" with a ticket reference | This is documented technical debt, not a smell |
