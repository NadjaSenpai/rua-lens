# Contributing to RUA Lens

## Development requirements

- Node.js 22.13 or later in the 22 LTS line
- npm
- A local copy of `wrangler.jsonc.example` named `wrangler.jsonc`
- A local copy of `.dev.vars.example` named `.dev.vars`

Install and prepare the project:

```bash
npm ci
cp wrangler.jsonc.example wrangler.jsonc
cp .dev.vars.example .dev.vars
npm run cf-typegen
npm exec -- wrangler d1 migrations apply DB --local
```

## Development workflow

RUA Lens uses vertical test-driven development. Add one observable failing test, make the minimum implementation pass, run the focused test, then run the full relevant test suite.

Before submitting a change:

```bash
npm run lint
npm run typecheck
npm test
npm run test:limits
npm run test:e2e
npm run build
npm run check:public-artifacts
npm run check:repository-content
npm run check:dependency-licenses
```

Use Conventional Commits for commit messages.

## Test data and privacy

Never add real DMARC reports, domains, email addresses, Cloudflare identifiers, Access settings, database IDs, tokens, or deployment URLs. Fixtures must use `example.com`, reserved IP address ranges, and fictional organizations.

Do not add telemetry, analytics, external fonts, external CDNs, or IP-enrichment services.

## Scope

Version 0.1.0 intentionally excludes automatic mail ingestion, raw report storage, alerts, policy recommendations, multi-tenant SaaS behavior, and non-Cloudflare deployment targets. Discuss scope changes before implementing them.
