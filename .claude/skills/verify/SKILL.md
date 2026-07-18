---
name: verify
summary: Drive RUA Lens locally through its browser UI
---

# Verify RUA Lens

1. Prepare local state with synthetic data only:
   ```bash
   npm ci
   cp -n wrangler.jsonc.example wrangler.jsonc
   cp -n .dev.vars.example .dev.vars
   npm exec -- wrangler d1 migrations apply DB --local
   ```
2. Start the app and wait for the Worker-backed Vite server:
   ```bash
   npm run dev -- --host 127.0.0.1
   curl -sf http://127.0.0.1:5173/api/session
   ```
3. Drive `http://127.0.0.1:5173` with Playwright Chromium. If the browser executable is missing, run `npx playwright install chromium`.
4. Exercise the browser surface with repository fixtures only:
   - open the upload dialog and upload `test/fixtures/report-single.xml` plus `report-multiple.xml`;
   - confirm dashboard summary, trend legend/table fallback, disposition, and recent reports;
   - apply domain/date filters, including a reversed-date validation probe;
   - open the reports list and detail view;
   - test deletion only with a dedicated synthetic report created for verification.
5. Capture desktop and 390px mobile screenshots and inspect browser console errors. For mobile overflow, check `document.documentElement.scrollWidth === window.innerWidth`; full-page screenshots can expand internal scrollable tables, so use a viewport screenshot for visual evidence.
