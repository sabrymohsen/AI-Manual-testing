/** @type {import('next').NextConfig} */
const nextConfig = {
  // REQUIRED for the Docker image. The Dockerfile does:
  //   COPY --from=builder /app/.next/standalone ./
  // and `next build` only emits .next/standalone when this is set. Dropping it
  // makes the image build fail at that COPY with "not found", which is exactly
  // how the staging and master deploys broke.
  output: "standalone",
  experimental: {
    // Next 14's key. (Next 15 renames this to top-level `serverExternalPackages`.)
    serverComponentsExternalPackages: ["playwright"],
  },
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
