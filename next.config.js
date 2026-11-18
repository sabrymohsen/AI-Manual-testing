/** @type {import('next').NextConfig} */
const nextConfig = {
  // The desktop app serves its own production build from .next-desktop so it
  // never collides with `npm run dev`, which owns .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // REQUIRED for the Docker image. The Dockerfile does:
  //   COPY --from=builder /app/.next/standalone ./
  // and `next build` only emits .next/standalone when this is set. Dropping it
  // makes the image build fail at that COPY with "not found", which is exactly
  // how the staging and master deploys broke.
  // The desktop build (NEXT_DIST_DIR set) is served with `next start` and
  // doesn't need it: standalone copied 2.7 GB of the repo into the build.
  output: process.env.NEXT_DIST_DIR ? undefined : "standalone",
  experimental: {
    // Enables src/instrumentation.ts (starts the Automation Hub scheduler).
    instrumentationHook: true,
    // Next 14's key. (Next 15 renames this to top-level `serverExternalPackages`.)
    // pdf-parse pulls in pdfjs-dist, which webpack can't bundle (it crashes at
    // load with "Object.defineProperty called on non-object", taking down every
    // route that imports the document extractor). Load them from node_modules.
    serverComponentsExternalPackages: ["playwright", "pdf-parse", "pdfjs-dist"],
  },
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
