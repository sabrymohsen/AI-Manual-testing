# Research: AI Manual QA Tester

## Technology Decisions

### Frontend Framework: Next.js 14+ App Router
- **Decision**: Next.js App Router with TypeScript
- **Rationale**: Provides both frontend UI and backend API routes in a single project, reducing deployment complexity. App Router supports server components, server actions, and streaming — all valuable for a dashboard-heavy app. The built-in API routes eliminate the need for a separate Express/Fastify server.
- **Alternatives considered**: Remix (similar full-stack approach but smaller ecosystem), standalone React + Express (more boilerplate, separate deployment), Blitz.js (opinionated but less mature)

### UI Component System: shadcn/ui
- **Decision**: shadcn/ui (Radix UI primitives + Tailwind CSS)
- **Rationale**: Tailwind CSS provides utility-first styling, shadcn/ui offers accessible, customizable components that we own (not a dependency). lucide-react for icons. Supports dark mode out of the box.
- **Alternatives considered**: MUI (heavy, opinionated styling), Chakra UI (good but larger bundle), Ant Design (heavy, Chinese ecosystem focus), Headless UI + custom (more work)

### Form & Validation: React Hook Form + Zod
- **Decision**: React Hook Form with Zod schemas
- **Rationale**: React Hook Form handles form state and performance (unnecessary re-renders). Zod provides TypeScript-first validation with excellent type inference — shared schemas between client and server.
- **Alternatives considered**: Formik (more re-renders, larger bundle), native HTML validation (limited), Yup (similar but slightly slower type inference)

### ORM: Prisma
- **Decision**: Prisma ORM with PostgreSQL
- **Rationale**: Type-safe database client, auto-generated types, excellent migration system, visual schema editor via Prisma Studio. Supports PostgreSQL well. JSON fields for test data and assertions map cleanly to Prisma's Json type.
- **Alternatives considered**: Drizzle ORM (lighter but fewer features), TypeORM (decorator-based, heavier), raw SQL (too much boilerplate), Kysely (type-safe but no migrations)

### Queue: BullMQ
- **Decision**: BullMQ with Redis
- **Rationale**: Mature, Redis-backed job queue with priority, retries, delays, and job events. Worker processes can run in separate containers. Built-in job status tracking matches our needs.
- **Alternatives considered**: In-process queue (fails on crash), RabbitMQ (heavier, AMQP overhead), AWS SQS (vendor lock-in), PQueue (in-memory only)

### Browser Automation: Playwright
- **Decision**: Playwright Node.js API (Chromium default)
- **Rationale**: Industry-standard browser automation. Supports screenshots, console log collection, network interception, tracing, video recording. Native TypeScript support. More reliable than Puppeteer (cross-browser, better selectors).
- **Alternatives considered**: Puppeteer (Chrome-only, smaller API surface), Cypress (not designed for programmatic control), Selenium (slower, more complex)

### Encryption: AES-256-GCM
- **Decision**: Node.js crypto module AES-256-GCM
- **Rationale**: Authenticated encryption (GCM mode provides integrity verification). Zero dependencies. Industry standard for encrypting secrets at rest. IV + auth tag + ciphertext stored together.
- **Alternatives considered**: bcrypt (one-way hash, can't decrypt), simple base64 (no security), libsodium (external dependency)

### Visual Diff: pixelmatch + pngjs
- **Decision**: pixelmatch for image comparison, pngjs for image processing
- **Rationale**: pixelmatch is lightweight, fast, and produces diff images. pngjs handles PNG encoding/decoding without native dependencies. Combined, they provide pixel-level comparison with configurable tolerance.
- **Alternatives considered**: resemble.js (heavier, more features than needed), ImageMagick CLI (slow, dependency), AWS Rekognition (overkill, paid, vendor lock-in)

### AI: OpenAI-Compatible API
- **Decision**: OpenAI-compatible API (any provider)
- **Rationale**: Standardized API format means users can choose any provider (OpenAI, Anthropic via proxy, local LLMs). Configurable base URL and API key. Structured output via function calling matches our test case generation needs.
- **Alternatives considered**: Anthropic Claude API (different format), Google Gemini API (different format), LangChain (over-engineered for simple generation)

## Security Research

### Credential Storage Flow
1. User submits password over HTTPS
2. Server generates random 96-bit IV
3. Server encrypts using AES-256-GCM with APP_ENCRYPTION_KEY
4. Server stores: encrypted value, IV, auth tag, key version
5. Decryption only happens server-side when worker needs to log in
6. Worker decrypts in memory, uses for login, discards after

### Log Sanitization Rules
Must sanitize before storage:
- `Authorization: Bearer <token>` → `Authorization: Bearer ***MASKED***`
- `Cookie: session=abc123` → `Cookie: ***MASKED***`
- `Set-Cookie: ...` → ***MASKED***
- Any JSON body containing `password`, `secret`, `token`, `api_key` → ***MASKED***
- URL query params containing `token`, `api_key`, `secret` → ***MASKED***

### AI Safety
- AI receives: sanitized DOM snapshot, page title, step descriptions, expected results, error messages
- AI never receives: passwords, cookies, auth headers, API keys, session IDs, personal data
- All AI input is stripped of sensitive fields before sending

## Deployment Research

### Docker Strategy
- **web**: Next.js app with `npm run dev` (or production build)
- **worker**: Same codebase, different entry point (`npm run worker`)
- **postgres**: PostgreSQL 16 with persistent volume
- **redis**: Redis 7 with persistent volume
- Storage mounted as named volume for screenshots/logs

### Worker Image Requirements
- Playwright browsers need system dependencies: libnss3, libnspr4, libatk1.0-0, libatk-bridge2.0-0, libcups2, libdrm2, libdbus-1-3, libxkbcommon0, libxcomposite1, libxdamage1, libxrandr2, libgbm1, libpango-1.0-0, libcairo2, libasound2
- Use `mcr.microsoft.com/playwright:v1.40.0-focal` as base image

## Performance Notes

- Test execution is the heaviest operation; offloading to BullMQ prevents UI blocking
- Screenshots are saved as PNG files and referenced in DB by path (not stored as blobs)
- Log entries are batched per step result, not per log line
- Network logs filtered to exclude static assets (images, fonts) by default to reduce storage
- AI requests timeout at 30 seconds; fallback to "AI unavailable" message
