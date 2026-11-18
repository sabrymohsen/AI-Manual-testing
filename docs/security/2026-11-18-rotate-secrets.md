# Rotating secrets after the Automation Hub exposure (2026-11-18)

## Why

Until the 2026-11-18 fix, any signed-in user could create a hub script and run
it on the server with the server's full `process.env` (see `src/lib/hub-access.ts`).
A test could therefore print every environment variable. With `DATABASE_URL` it
could also read the whole database, and with `APP_ENCRYPTION_KEY` it could
decrypt every stored token.

Treat everything below as possibly exposed on any environment where someone
outside your team could register before the fix was deployed. Deploy the fix
first. Rotating before the fix is live just leaks the new values.

These steps change production and log every user out, so a person runs them.

## 0. Before you start

- Deploy the hub security fix to staging, check it there, then deploy it to production.
- Optional: check whether anyone used the gap. On each environment, look at
  `"TestScript"` and `"TestExecution"` rows created by users who aren't on your
  team, especially scripts with `projectId IS NULL` and any code that reads
  `process.env`.
- Do staging first, then production. Use a new value for each environment, never the same value on both.

## 1. Third-party tokens (most important)

These give access to systems outside this app, so rotate them at the provider:
create a new token, paste it into the app, then revoke the old one.

| Where it's stored | What it is | Re-enter in |
|---|---|---|
| `IntegrationConfig`, `ProjectIntegration`, `OpenProjectIntegration`, `OpenProjectFeatureConfig` | Jira / Azure DevOps / OpenProject / GitHub tokens, webhook secret | Project → Integrations |
| `FigmaConfig` | Figma token | Project → Figma |
| `ProjectAiConfig`, `AiProviderConfig.apiKey`*, `AgentSettings.apiKey`*, `McpConfig.apiKey`* | AI provider keys | Automation Hub → AI Agent → Providers; project AI settings |
| `ProjectCredential`, `TestDataVariable` (secret), hub `EnvironmentVariable` (secret) | Logins and secrets used by tests | Project credentials / Test Data / Data & settings |

\* Stored in **plain text**, so anyone who had `DATABASE_URL` could read them
without the encryption key.

Also check Railway for any provider keys set as variables (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENAI_COMPATIBLE_API_KEY`, `HUGGINGFACE_API_TOKEN`,
`FIGMA_API_TOKEN`) and rotate those at the provider too.

## 2. Database password

Railway → Postgres service → Settings: regenerate the credentials. The
app's `DATABASE_URL` normally references the Postgres service variable, so it
updates on its own. If `DATABASE_URL` was pasted in as a literal string, update it by hand.
Redeploy `AI-Manual-testing` and `Recorder`.

## 3. Session secrets (logs everyone out)

Generate a new value for each:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- `NEXTAUTH_SECRET` (and `JWT_SECRET` if it's set) on `AI-Manual-testing`
- `RECORDER_WORKER_SECRET`: set the **same new value** on both `AI-Manual-testing` and `Recorder`

Then `railway redeploy -y` both services. Everyone signs in again. Hub CI tokens
(`qae_…`) are stored as hashes and don't depend on these.

## 4. `APP_ENCRYPTION_KEY`

**Don't just swap this value.** The app has one key and no fallback, so every
stored encrypted value (the tables in step 1) would stop decrypting.

Once step 1 is done, the old key only protects old, revoked tokens. Pick one:

- **A. Leave it.** Fine if you rotated every token in step 1.
- **B. Re-encrypt.** Run a one-off script that decrypts each encrypted column
  with the old key and re-encrypts it with the new one in a single
  transaction. Then set the new key (exactly 32 bytes in base64, 44 characters)
  and redeploy. This script doesn't exist yet.
- **C. Clear and re-enter.** Set a new key, then re-enter each token from
  step 1. Until you do, every integration fails to decrypt.

## 5. Afterwards

- Run the hub security tests: `npx vitest run tests/integration/hub-security.test.ts`.
- Check sign-in, one tracker sync, one Figma sync and one hub run on staging, then on production.
