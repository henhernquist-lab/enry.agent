import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Cruise enable route reads the runner templates from cruise-runner/ at
  // runtime and commits them into the target repo. These files aren't imported
  // as modules, so Vercel's tracer won't bundle them unless we force-include.
  outputFileTracingIncludes: {
    '/api/cruise/repos/enable': ['./cruise-runner/**'],
  },
};

export default nextConfig;
