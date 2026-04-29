/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ensure runtime-read files (prompt MDs, data JSON) are bundled into
    // Vercel serverless functions via output file tracing.
    outputFileTracingIncludes: {
      "/api/evaluation/run": ["./.claude/prompts/evaluation-agent.md"],
      "/api/sourcing/scan": [
        "./.claude/prompts/research-agent.md",
        "./src/data/real-agents.json",
      ],
      "/api/scorecard/generate": ["./.claude/prompts/scorecard-agent.md"],
    },
  },
};

export default nextConfig;
