import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-pty is a native C++ addon (used by Drive's real-shell terminal
  // panes). Next.js auto-externalizes it, but Turbopack in dev needs it
  // listed explicitly or route compilation hangs trying to bundle the
  // .node binary. See src/lib/terminal/pty-manager.ts.
  serverExternalPackages: ["node-pty"],
  // The Cruise enable route reads the runner templates from cruise-runner/ at
  // runtime and commits them into the target repo. These files aren't imported
  // as modules, so Vercel's tracer won't bundle them unless we force-include.
  outputFileTracingIncludes: {
    '/api/cruise/repos/enable': ['./cruise-runner/**'],
  },
};

export default nextConfig;
