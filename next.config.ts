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
    // Same arrangement for Overnight R&D — the dispatch route provisions the
    // scratch repo by committing these into it.
    '/api/lab/overnight/dispatch': ['./overnight-runner/**'],
  },
  // Route renames (Golem rebrand): redirect old paths to new ones
  // so existing bookmarks/shared links don't 404.
  async redirects() {
    return [
      { source: '/agent/:path*', destination: '/forge/:path*', permanent: true },
      { source: '/room/:path*', destination: '/atelier/:path*', permanent: true },
      { source: '/resources/notes', destination: '/grimoire', permanent: true },
      { source: '/architect/:path*', destination: '/scribe/:path*', permanent: true },
      { source: '/learn/:path*', destination: '/scriptorium/:path*', permanent: true },
      { source: '/models/benchmark', destination: '/trials', permanent: true },
      { source: '/lab/black-market/:path*', destination: '/lab/foundry/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
