// ESM loader hook that intercepts imports of the `ai` package, substituting
// it with our stub, AND resolves extensionless relative TypeScript imports
// (../nim, ../github) to their .ts files (Node's --experimental-strip-types
// doesn't auto-add .ts to bare specifiers). Used by scripts/verify-nl-edit.mjs
// via --import. The ai stub's `generateText` returns globalThis.__mockText.
export async function resolve(specifier, context, nextResolve) {
  // Extensionless RELATIVE imports from a TS file: rewrite to add .ts.
  // Only relative specifiers (./ or ../) — bare package imports (zod, ai,
  // etc.) must NOT be mangled or we break Node's package-export resolution.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const base = specifier
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await nextResolve(base + ext, context)
      } catch {
        // try next extension
      }
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, defaultLoad) {
  try {
    if (/\/node_modules\/ai\/dist\/index\.(mjs|js)$/.test(new URL(url).pathname)) {
      return {
        format: 'module',
        source: `
          export async function generateText(opts) {
            globalThis.__lastOpts = opts
            const text = globalThis.__mockText ?? JSON.stringify({ decision: 'refuse', reason: 'no mock set' })
            return { text, finishReason: 'stop' }
          }
        `,
        shortCircuit: true,
      }
    }
  } catch {
    // non-URL specs pass through untouched
  }
  return defaultLoad(url, context)
}
