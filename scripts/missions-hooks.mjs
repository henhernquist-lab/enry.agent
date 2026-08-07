// ESM loader hook for scripts that import the mission spine directly.
//
// Same idea as scripts/verify-loader.mjs, minus the `ai` stub, plus one thing
// that loader doesn't do: resolve the `@/` path alias. src/lib/missions/*
// imports `@/lib/supabase`, which Node has no idea about — tsconfig's paths
// mapping only exists for the TypeScript compiler and Next's bundler.
//
// Registered by scripts/missions-loader.mjs — exporting `resolve` from a file
// passed to --import does NOT install hooks; it has to go through
// module.register(). (scripts/verify-loader.mjs predates this and never
// registers, so its documented invocation silently applies no hooks.)

import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'

const SRC = resolvePath(process.cwd(), 'src')

export async function resolve(specifier, context, nextResolve) {
  // `@/foo/bar` → <cwd>/src/foo/bar, trying each TS extension the way the
  // bundler would.
  if (specifier.startsWith('@/')) {
    const base = pathToFileURL(resolvePath(SRC, specifier.slice(2))).href
    for (const ext of ['.ts', '.tsx', '/index.ts', '']) {
      try {
        return await nextResolve(base + ext, context)
      } catch {
        // try the next extension
      }
    }
  }

  // Extensionless relative imports from a TS file.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await nextResolve(specifier + ext, context)
      } catch {
        // try the next extension
      }
    }
  }

  return nextResolve(specifier, context)
}
