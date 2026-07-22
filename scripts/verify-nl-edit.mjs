// Local end-to-end verifier for nl-edit.ts. Mocks the `ai` package's
// generateText with controlled scenario outputs over the same module surface
// the production code uses (same import path), so a real invocation of
// classifyNLEditTarget runs through the same classification logic. Run via:
//   node --import ./scripts/verify-loader.mjs --experimental-strip-types ./scripts/verify-nl-edit.mjs
//
// Each scenario sets globalThis.__mockText to a JSON string the mock will
// return, then re-runs classifyNLEditTarget against a representative input.
// Flags FAIL/PASS per scenario.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// Load env keys from .env.local so nimClientFor doesn't throw on construction.
// (The actual NIM call is mocked — but nimClientFor still reads the key string
// when constructing the OpenAI client, before generateText is invoked.)
try {
  const env = readFileSync(resolve(repoRoot, '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch (e) {
  console.error('Could not parse .env.local:', e.message)
  process.exit(1)
}

// Register the ESM loader hooks (ai stub + extensionless-.ts resolver) as a
// side-effecting module via node:module's register API. This is Node 24's
// supported mechanism; --import without this only pre-loads scripts but does
// not install loader hooks.
import { register } from 'node:module'
register('./verify-loader.mjs', import.meta.url)

const nlEditPath = resolve(repoRoot, 'src/lib/terminal/nl-edit.ts')

const scenarios = [
  {
    name: 'Crews/Squads (multi_file decision)',
    instruction: 'Add a Crews & Squads feature: a new schema table for squads, a back-end route to list them, and a UI page showing squads',
    mockText: JSON.stringify({
      decision: 'multi_file',
      reason: 'spans schema + backend + UI',
      summary: 'Add Crews & Squads (4-file plan)',
      steps: [
        { file: 'supabase/migrations/20260722000000_crews_squads.sql', is_new_file: true, instruction: 'Create the squads table with id, name, owner_id, created_at' },
        { file: 'src/app/api/squads/route.ts', is_new_file: true, instruction: 'GET handler returning squads from the DB' },
        { file: 'src/components/squads/squads-list.tsx', is_new_file: true, instruction: 'Client component rendering the list of squads' },
        { file: 'src/app/squads/page.tsx', is_new_file: true, instruction: 'Server page wiring the API to the list component' },
      ],
    }),
    expect: (r) => r && r.ok === false && Array.isArray(r.multiFile?.steps) && r.multiFile.steps.length === 4,
  },
  {
    name: 'Follow-up "do multiple files" with prior-multi_file history',
    instruction: 'so it doesnt need to be single file do multple files',
    history: [{ input: 'Add a Crews & Squads feature...', result: 'multi_file', resultDetail: 'multi-file plan surfaced' }],
    // The honest model behavior here would be multi_file again; verify the
    // parser PATH is now reachable for that decision (previously only refuse
    // was reachable). Mocking the model output ensures we exercise the parse,
    // regardless of what any specific model actually returns.
    mockText: JSON.stringify({
      decision: 'multi_file',
      reason: 'user is explicitly requesting multi-file scope',
      summary: 'Re-planning Crews & Squads as multi-file steps',
      steps: [
        { file: 'supabase/migrations/20260722000000_crews_squads.sql', is_new_file: true, instruction: 'create squads table' },
        { file: 'src/app/api/squads/route.ts', is_new_file: true, instruction: 'GET handler' },
        { file: 'src/app/squads/page.tsx', is_new_file: true, instruction: 'UI page' },
      ],
    }),
    expect: (r) => r && r.ok === false && r.multiFile?.steps?.length === 3,
  },
  {
    name: 'Honest refuse for non-code request (unchanged behavior)',
    instruction: 'what is the weather in Tokyo today',
    mockText: JSON.stringify({ decision: 'refuse', reason: 'weather is not a repo edit' }),
    expect: (r) => r && r.ok === false && typeof r.error === 'string' && /Not a code change I can make here/.test(r.error) && !r.multiFile,
  },
  {
    name: 'Single-file resolve (unchanged)',
    instruction: 'fix the typo in the README',
    mockText: JSON.stringify({ decision: 'resolve', reason: 'README.md', file: 'README.md', is_new_file: false }),
    expect: (r) => r && r.ok === true && r.target.file === 'README.md' && r.target.isNewFile === false,
  },
  {
    name: 'multi_file returned with zero usable steps degrades to honest refuse',
    instruction: 'refactor the world',
    mockText: JSON.stringify({ decision: 'multi_file', reason: 'spans many files', steps: [] }),
    expect: (r) => r && r.ok === false && typeof r.error === 'string' && /one file per step/.test(r.error) && !r.multiFile,
  },
  {
    name: 'multi_file step escapes repo -> dropped, rest kept',
    instruction: 'edit file and outside path',
    mockText: JSON.stringify({
      decision: 'multi_file',
      summary: 'test',
      steps: [
        { file: '/etc/passwd', is_new_file: false, instruction: 'bad' },
        { file: '../escape', is_new_file: true, instruction: 'bad' },
        { file: 'src/app/page.tsx', is_new_file: false, instruction: 'good' },
      ],
    }),
    expect: (r) => r && r.ok === false && r.multiFile?.steps?.length === 1 && r.multiFile.steps[0].file === 'src/app/page.tsx',
  },
]

let passCount = 0
let failCount = 0
const DUMMY_FILE_LIST = [
  'README.md',
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/app/api/chat/route.ts',
  'supabase/migrations/001_init.sql',
  'package.json',
].join('\n')

let classifyFn = null
async function runAll() {
  // Import once (mock stays in scope for subsequent re-imports since the
  // register hook persists for the process).
  const mod = await import('file://' + nlEditPath)
  classifyFn = mod.classifyNLEditTarget

  for (const s of scenarios) {
    globalThis.__mockText = s.mockText
    let result
    try {
      result = await classifyFn(DUMMY_FILE_LIST, s.instruction, 'z-ai/glm-5.2', s.history)
    } catch (e) {
      result = { __threw: e.message }
    }
    const ok = s.expect(result)
    if (ok) {
      passCount++
      console.log(`  PASS  ${s.name}`)
    } else {
      failCount++
      // Defensive: result may contain large nested structures; JSON-ify
      // truncated for visibility without leaking API key etc. (model just
      // returned what we mocked, so safe.)
      const preview = JSON.stringify(result).slice(0, 300)
      console.log(`  FAIL  ${s.name}`)
      console.log(`        returned: ${preview}`)
    }
  }
  console.log('')
  console.log(`Result: ${passCount} pass, ${failCount} fail`)
  process.exit(failCount > 0 ? 1 : 0)
}

runAll().catch((e) => { console.error(e); process.exit(1) })
