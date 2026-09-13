# Deploying the web app to Vercel (free tier)

The app renders without any environment variables. Every page that reads a chain is
`force-dynamic` and falls back to public RPCs, so an unconfigured deployment shows real
UI with clear "not configured yet" panels rather than a white screen. That makes it a
valid demo link on day one.

## One-time setup

1. Push the repo to GitHub and make it **public**.
2. On vercel.com -> **Add New... -> Project** -> import the repo.
3. **Application Preset: Next.js.** If Vercel offers its "Services" preset (it detects
   `services/mock-accounting` as a second deployable app), switch away from it. Do not
   deploy the mock accounting service - it is a stub with a hardcoded token.
4. **Root Directory: `apps/web`.**
5. Open **Root Directory -> Advanced** (or Settings -> General after import) and tick
   **"Include source files outside of the Root Directory in the Build Step."**
   This is required, not optional. `packages/shared/src/constants/ens.ts` imports
   `contracts/sepolia/deployments/sepolia.json`, four levels above `apps/web`. Without the
   toggle the build fails with:
   `Module not found: Can't resolve '../../../../contracts/sepolia/deployments/sepolia.json'`
6. Leave Build and Output Settings on their defaults. Vercel detects the pnpm workspace and
   installs from the repository root, then runs `next build` inside `apps/web`.
7. Deploy. Cold build is roughly 90 seconds.

There is deliberately **no `vercel.json`** in this repo. With Root Directory set to
`apps/web`, Vercel reads `apps/web/vercel.json` and ignores a root-level one; and a root-level
`vercel.json` declaring `"framework": "nextjs"` makes the build fail with
`No Next.js version detected`, because `next` is a dependency of `apps/web`, not of the
workspace root.

`.vercelignore` stays at the repository root - it filters the upload, not the build - and
correctly drops the Foundry submodules (~2100 files) while keeping
`contracts/*/deployments/*.json`, which the build does read.

## Environment variables

None are required. Add these in Vercel → Settings → Environment Variables only when you
want the corresponding feature live:

| Variable | Effect if unset |
| --- | --- |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | falls back to `ethereum-sepolia-rpc.publicnode.com` (rate-limited but fine for a demo) |
| `NEXT_PUBLIC_HEDERA_JSON_RPC` | falls back to `testnet.hashio.io/api` |
| `NEXT_PUBLIC_HEDERA_MIRROR` | falls back to the public testnet mirror node |
| `NEXT_PUBLIC_SITE_URL` | og:image resolves against the Vercel deployment URL instead of a custom domain |
| `ADAPTER_URL`, `ADAPTER_API_KEY` | `/api/finance` and `/api/kyc` return an error; browsing still works |
| `TRIGGER_SIGNER_PRIVATE_KEY`, `CRE_TRIGGER_URL` | the "Finance" button cannot trigger the CRE workflow |

Never put `TRIGGER_SIGNER_PRIVATE_KEY` in a `NEXT_PUBLIC_*` variable — it is read server-side
only, inside a route handler.

## What is not deployed

The adapter (`services/adapter`) and the mock accounting service
(`services/mock-accounting`) are long-running Hono servers and are not part of this
deployment. Vercel hosts the Next.js app only. For a live end-to-end demo, run those two
locally and point `ADAPTER_URL` at a tunnel, or run the whole stack locally with
`pnpm dev`.

`services/cre` is a Bun project driven by the Chainlink `cre` CLI and is excluded from the
pnpm workspace, so it never enters the Vercel build.

## Cost

Everything above fits the Vercel Hobby (free) plan: one project, dynamic SSR routes,
no cron, no edge config, no image optimization beyond the three static icon routes.
