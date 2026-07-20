# Self-hosting RUA Lens

## Prerequisites

- Node.js 22.13 or later in the 22 LTS line, and npm
- A Cloudflare account with Workers, D1, and Access available
- Wrangler authentication for the target account
- An identity provider configured in Cloudflare Zero Trust

## Prepare the project

```bash
npm ci
cp wrangler.jsonc.example wrangler.jsonc
cp .dev.vars.example .dev.vars
npm run cf-typegen
```

`.dev.vars` enables the fictional local development identity for tests and local verification only. Never deploy with `AUTH_MODE=dev`.

Do not commit `wrangler.jsonc`, `.dev.vars`, Cloudflare identifiers, Access values, or deployment URLs.

## Verify locally with synthetic data

Apply the local migration and start the development server:

```bash
npm exec -- wrangler d1 migrations apply DB --local
npm run dev
```

Open `http://127.0.0.1:5173`, choose **レポートをアップロード**, and select `test/fixtures/report-single.xml`. Confirm that the dashboard shows four messages and a 100% DMARC success rate. Re-upload the same fixture and confirm that it is reported as **登録済み**.

## Create D1

```bash
npm exec -- wrangler d1 create rua-lens --binding DB --update-config
npm exec -- wrangler d1 migrations apply DB --remote
```

Confirm that Wrangler updated only the ignored local `wrangler.jsonc`.

## Configure Cloudflare Access

1. Create a self-hosted Access application for the Worker hostname.
2. Add the identity-provider policy appropriate for the trusted organization.
3. Record the Access team domain and application audience in a secure deployment system.
4. Configure `AUTH_MODE=access`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ADMIN_EMAILS` for the Worker.
5. Keep administrator email addresses out of source control.

RUA Lens validates the Access JWT again inside the Worker. Missing or invalid Access configuration fails closed.

## Build and deploy

Run the credentials-free checks first:

```bash
npm run lint
npm run typecheck
npm test
npm run test:limits
npm run test:e2e
npm run build
npm exec -- wrangler deploy --dry-run
npm run check:public-artifacts
npm run check:repository-content
npm run check:dependency-licenses
```

Then deploy from an authenticated environment:

```bash
npm exec -- wrangler deploy
```

Protect the final hostname with the Access application before allowing users to upload reports.

## Remote memory release gate

Before a release, create a disposable D1 database whose name contains `scratch` or `remote-limits`. Copy the ignored local Wrangler config to `wrangler.remote-limits.jsonc`, bind both `database_id` and `preview_database_id` to that same disposable database, and keep the config ignored and untracked.

Run the gate only with a scoped API token and an explicit confirmation of the exact scratch database ID:

```bash
CLOUDFLARE_ACCOUNT_ID="<account-id>" \
CLOUDFLARE_API_TOKEN="<scoped-token>" \
RUA_LENS_REMOTE_CONFIG="$PWD/wrangler.remote-limits.jsonc" \
RUA_LENS_REMOTE_EXPECTED_DATABASE_ID="<scratch-d1-id>" \
RUA_LENS_REMOTE_CONFIRM_SCRATCH=1 \
npm run test:limits:remote
```

The probe applies migrations to that database, starts `wrangler dev --remote`, and checks the 20 MiB expanded XML, 25 MiB multipart, and 20-report partial-success boundaries. Delete the temporary D1 database and local config after the run.

Record only the date, Wrangler version, and pass/fail result. Do not store the temporary URL, account ID, database ID, report data, or Access configuration in the repository.

## Data retention and deletion

RUA Lens does not store original uploads. It stores normalized report content and the importing user's email address until an administrator deletes the report. There is no automatic expiration.

Deletion cascades through normalized child rows and cannot be undone. Restoring deleted data requires uploading the original report again.

## Backup

Use Cloudflare D1 export procedures appropriate for the deployment's retention policy. Protect exports as operational DMARC data; never add them to this repository.
