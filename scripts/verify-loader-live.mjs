// ESM loader that ONLY resolves extensionless relative TypeScript imports
// to .ts files. Used by scripts/verify-live.mjs — unlike verify-loader.mjs
// it does NOT stub the `ai` package, so real NIM HTTP requests go out.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await nextResolve(specifier + ext, context)
      } catch {
        // try next extension
      }
    }
  }
  return nextResolve(specifier, context)
}
