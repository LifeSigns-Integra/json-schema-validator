# JSON Schema Validator

A Progressive Web App that validates JSON documents against a shared, versioned schema library. Validation runs entirely in the browser (Ajv in a Web Worker), so there is no backend, payloads never leave the device, and the app keeps working offline after the first visit. It is hosted on GitHub Pages and deployed by GitHub Actions.

## How it works

| Piece | Where | Notes |
| --- | --- | --- |
| Schema library | `schemas/<name>/<n>.json` + `meta.json` | Versions are immutable; publish a change as a new file |
| Manifest | built into `public/schemas/manifest.json` | Lists versions, dialects and SHA-256 checksums |
| App | `src/` (React + Vite + TypeScript) | Monaco editor, Ajv validation in a worker |
| Offline | `vite-plugin-pwa` (Workbox) + `src/lib/library.ts` | App shell precached; manifest network-first; schema versions cache-first and checksum-verified |
| Hosting | GitHub Pages via `.github/workflows/deploy.yml` | Deployed on every merge to `main` |

## Local development

Requires Node.js 22+.

```bash
npm install
npm run dev          # http://localhost:5173 (rebuilds the schema manifest first)
npm test             # unit tests
npm run build        # schema checks + typecheck + production build into dist/
npm run preview      # serve dist/ to try the service worker and offline mode
```

The service worker only runs in production builds. To test offline mode: `npm run build && npm run preview`, open the app once, then turn the network off in DevTools and reload.

## Adding or changing a schema (admins)

1. Create a branch.
2. For a **new schema**, add `schemas/<name>/meta.json` and `schemas/<name>/1.json`. Names are lowercase kebab-case.

   ```json
   { "description": "What this payload is", "status": "ACTIVE" }
   ```

3. For a **new version**, copy the latest `<n>.json` to `<n+1>.json` and edit the copy. Never edit or delete an existing version file; CI rejects it.
4. Every version file must declare its dialect in `$schema`:
   - `https://json-schema.org/draft/2020-12/schema`
   - `http://json-schema.org/draft-07/schema#`
5. Run `npm run validate-schemas` locally, then open a pull request. A second admin reviews and merges.
6. To retire a schema, set `"status": "RETIRED"` in its `meta.json`. It disappears from the dropdown; its files stay published.

CI (`.github/workflows/ci.yml`) fails a pull request if:

- an existing version file was modified or deleted;
- a schema is not valid JSON, has no supported `$schema`, or does not compile with Ajv (unknown keywords such as typos are errors);
- a schema uses a non-local `$ref` (anything not starting with `#`);
- a `pattern` or `patternProperties` regex risks catastrophic backtracking;
- version numbers have gaps, or files are misnamed;
- unit tests or the build fail.

## One-time GitHub setup

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Branches:** protect `main`, require a pull request with 1 approval, and require the `CI / check` status check.
4. Push to `main` (or run the *Deploy to GitHub Pages* workflow manually). The site appears at `https://<owner>.github.io/<repo>/`.

The deploy workflow reads the correct base path from `actions/configure-pages`, so it works for both project sites (`/<repo>/`) and `<owner>.github.io` sites (`/`).

> **Visibility:** GitHub Pages sites are public on the internet, even when the repository is private, unless the organization uses GitHub Enterprise Cloud with private Pages. Only publish schemas that may be public, or enable private Pages.

## Behaviour notes

- **Freshness:** the manifest is fetched with a cache-busting query on every load (3 s timeout). When a newer manifest arrives, all active schema versions not yet cached are downloaded in the background, so they are available offline later.
- **Status badge:** shows whether the library came from the network or the saved copy, and its age. A saved library older than 7 days is flagged as possibly outdated.
- **Reports:** the downloadable report records the schema name, version, checksum, and whether the library was `online` or `cache`, so a result can be traced to an exact schema.
- **Safety:** validation runs in a Web Worker that is stopped after 5 s. At most 500 errors are listed. Ajv never loads remote schemas. A Content-Security-Policy meta tag is added to production builds.
- **Privacy:** the JSON you paste is never stored or sent anywhere. Only the last selected schema name is remembered (in `localStorage`).

## Project layout

```
schemas/                      schema library (source of truth)
scripts/
  library.ts                  reads schemas/, computes checksums
  build-library.ts            writes public/schemas/ + manifest.json
  validate-schemas.ts         CI checks (compile, $ref, regex safety)
  check-immutable.ts          CI check: published versions unchanged
src/
  App.tsx                     page layout and state
  validator.worker.ts         Ajv validation off the main thread
  components/                 editor, result panel, status badge, update toast
  lib/
    ajv.ts                    shared Ajv setup (browser and CI)
    library.ts                manifest/schema loading and offline cache
    locate.ts                 syntax errors and error → editor position
    errors.ts                 error messages and path formatting
    report.ts                 downloadable report
    validatorClient.ts        worker wrapper with timeout
    monaco.ts                 bundles Monaco locally (no CDN) for offline use
.github/workflows/
  ci.yml                      pull request checks
  deploy.yml                  build and deploy to GitHub Pages
```
