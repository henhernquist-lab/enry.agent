// Entry point for scripts that import the mission spine directly.
//
// Installs the resolver hooks in scripts/missions-hooks.mjs. A file given to
// --import is evaluated in the main thread, so exporting `resolve` from it
// does nothing on its own — module.register() is what actually installs a
// hook, and it needs the hooks in a separate module.
//
//   node --import ./scripts/missions-loader.mjs --experimental-strip-types \
//        ./scripts/verify-missions.mjs

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./missions-hooks.mjs', pathToFileURL(import.meta.filename))
