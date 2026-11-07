# JavaScript Migration and LTS Runtime Implementation Plan

| Field | Value |
| --- | --- |
| Document ID | UAIL-ITDASH-RUNTIME-JS-001 |
| Status | Assessment and implementation plan |
| Scope | Runtime dependency baseline, Node/npm LTS update path, TypeScript-to-JavaScript feasibility |
| Date | 2026-11-05 |
| Code changes made for this assessment | None |

## 1. Executive Recommendation

Keep the application in TypeScript for the production codebase. A full migration to JavaScript is feasible, but it would remove useful safeguards from the highest-risk parts of the system: gateway state normalization, collector payload parsing, auth/session handling, PostgreSQL mirroring, and dense dashboard/admin UI state.

If JavaScript is still required for staffing or long-term maintenance reasons, use an incremental JavaScript-with-JSDoc migration rather than a direct rename of all `.ts` and `.tsx` files. Keep TypeScript checking enabled through `allowJs` and `checkJs` during the transition.

For runtime modernization, standardize on Node.js `v26.13.0` LTS. The local workstation now has Node.js `v26.13.0` and npm `12.2.2`; the npm registry currently reports npm `12.2.2` as latest. The official Node.js `v26.13.0` release bundles npm `11.20.0`, so deployment must explicitly decide whether to use the bundled npm or to upgrade npm to `12.2.2` before staging the offline runtime.

## 2. Application Inventory

The application is a workspace-based Node.js system with these main parts:

| Area | Purpose | Current language/runtime |
| --- | --- | --- |
| `dashboard/` | Next.js operator/admin UI | TypeScript, TSX, React 19, Next 15 |
| `api-gateway/` | Express API, WebSocket feed, SQLite/PostgreSQL persistence | TypeScript, CommonJS build |
| `frontdoor-proxy/` | Operator/admin front-door HTTP proxy | TypeScript, CommonJS build |
| `collectors/nutanix/` | Nutanix REST collector | TypeScript, CommonJS build |
| `collectors/solarwinds/` | SolarWinds Playwright collector | TypeScript, CommonJS build |
| `collectors/symphony/` | Symphony Playwright collector | TypeScript, CommonJS build |
| `deployment/runtime-tools/` | PM2 runtime support for Windows/offline deployment | JavaScript package dependency only |

Observed TypeScript footprint:

| Metric | Value |
| --- | --- |
| TS/TSX files | 58 |
| Largest file | `dashboard/src/app/page.tsx` at 4,425 lines |
| Other large hotspots | `dashboard/src/app/admin/page.tsx`, `api-gateway/src/postgres.ts`, `api-gateway/src/db.ts`, `api-gateway/src/index.ts`, `collectors/solarwinds/src/index.ts`, `dashboard/src/lib/admin-runtime.ts` |

## 3. Validation Performed

Commands run:

```powershell
node -v
npm -v
npm ci
npm audit --workspaces --include-workspace-root
npm run build
npm ci
npm audit
npm outdated --workspaces --include-workspace-root --all
npm outdated --all
```

Validation results:

| Check | Result |
| --- | --- |
| Local Node.js | `v26.13.0` |
| Local npm | `12.2.2` |
| Latest Node.js LTS from nodejs.org | `v26.13.0`, LTS name `Lithium`, bundled npm `11.20.0` |
| Latest npm registry tag | `12.2.2` |
| Root workspace install | Passed |
| Root workspace explicit audit | `0 vulnerabilities` |
| Full workspace build | Passed |
| `deployment/runtime-tools` install | Passed |
| `deployment/runtime-tools` explicit audit | `0 vulnerabilities` |

Important npm 12 install warning:

```text
3 packages have install scripts blocked because they are not covered by allowScripts:
  better-sqlite3@12.11.1
  esbuild@0.28.1
  sharp@0.34.5
```

This did not block the TypeScript/Next production build during assessment, but it is a deployment risk. `better-sqlite3`, `esbuild`, and `sharp` use native or platform-specific install steps. The offline bundle and installed Windows runtime should not rely on these packages being only partially installed.

## 4. Runtime Update Plan

### 4.1 Target Runtime

Use this baseline:

| Tool | Target | Notes |
| --- | --- | --- |
| Node.js | `v26.13.0` LTS | Latest LTS observed from nodejs.org on 2026-11-05 |
| npm | `12.2.2` if explicitly upgrading npm, otherwise Node bundled `11.20.0` | npm does not have an LTS line in the same sense as Node.js |

Decision needed:

| Option | Recommendation | Tradeoff |
| --- | --- | --- |
| Use Node-bundled npm `11.20.0` | Safest for offline runtime reproducibility | Not the latest npm |
| Upgrade npm to `12.2.2` before staging | Best match for "latest npm" | Requires validating npm 12 install-script policy and installer behavior |

Recommended path: use Node.js `v26.13.0` LTS and npm `12.2.2` for developer/staging machines, but make the offline installer validation explicitly prove that npm 12 install-script approvals are present before copying `node_modules`.

### 4.2 Implementation Steps

1. Update runtime documentation to state the supported runtime baseline: Node.js `v26.13.0` LTS and npm `12.2.x`.
2. Add package `engines` metadata in the root package and workspaces, for example `node: ">=26.13.0 <27"` and `npm: ">=12.2.0 <13"` if the project chooses npm 12 as policy.
3. Validate whether npm 12 `allowScripts` approval is committed to `package.json`, `.npmrc`, or lockfile metadata when running:

   ```powershell
   npm install-scripts approve better-sqlite3
   npm install-scripts approve esbuild
   npm install-scripts approve sharp
   ```

4. Re-run:

   ```powershell
   npm ci
   npm audit --workspaces --include-workspace-root
   npm run build
   ```

5. Rebuild the offline staging payload with:

   ```powershell
   deployment/tools/stage-release.ps1
   ```

6. Validate that the staged payload contains working native/tooling packages:

   ```powershell
   node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"
   node -e "require('sharp'); console.log('sharp ok')"
   node -e "require('esbuild'); console.log('esbuild ok')"
   ```

7. Run the Windows deployment validation path:

   ```powershell
   deployment/tools/validate-offline-deployment.ps1
   ```

## 5. Dependency Update Assessment

Direct dependency observations from registry checks:

| Package | Current installed | Wanted | Latest | Assessment |
| --- | ---: | ---: | ---: | --- |
| `next` | `15.5.20` | `15.5.29` | `16.4.5` | Patch within 15 is low risk; 16 is a framework migration |
| `react` | `19.2.7` | `19.3.1` | `19.3.1` | Patch/minor update is reasonable after UI smoke testing |
| `react-dom` | `19.2.7` | `19.3.1` | `19.3.1` | Update with React |
| `recharts` | `2.15.4` | `2.15.4` | `3.10.1` | High UI regression risk; Recharts 2.x is deprecated |
| `lucide-react` | `0.468.0` | `0.468.0` | `1.69.0` | Check icon exports before upgrading |
| `express` | `4.22.2` | `4.22.3` | `5.3.0` | Patch 4.x first; Express 5 requires API behavior review |
| `better-sqlite3` | `12.11.1` | `12.11.1` | `13.0.3` | Native dependency; validate ABI and installer |
| `pg` | `8.22.0` | `8.23.1` | `8.23.1` | Low risk, but PostgreSQL is not supported installer path |
| `playwright` | `1.61.1` | `1.64.1` | `1.64.1` | Validate collector login/session flows |
| `tsx` | `4.23.0` | `4.23.15` | `4.23.15` | Low dev-time risk |
| `typescript` | `5.9.3` | `5.9.3` | `7.0.2` | Stay on stable 5.x until TS 7 compatibility is proven |
| `@types/node` | `22.20.1` | `22.20.5` | `26.6.6` | Update to 26 types only after Node 26 is the declared baseline |
| `pm2` in `deployment/runtime-tools` | `5.4.3` | `5.4.3` | `7.1.2` | Treat as deployment migration; validate Windows service behavior |

Recommended update sequence:

1. Runtime baseline first: Node.js `v26.13.0`, npm policy, install-script approvals.
2. Low-risk patch/minor updates: `next@15.x`, `react@19.3.x`, `react-dom@19.3.x`, `pg`, `playwright`, `tsx`, `@types/*`, `ws`.
3. Native/runtime validation: `better-sqlite3`, `sharp`, `esbuild`.
4. UI library migration: `recharts@3`.
5. Framework/runtime major migrations: `next@16`, `express@5`, `pm2@7`, TypeScript 7 when stable for this stack.

## 6. JavaScript Migration Feasibility

### 6.1 Feasibility Summary

A migration from TypeScript to JavaScript is technically feasible because:

- The server-side workspaces compile to CommonJS JavaScript.
- The dashboard already has `allowJs: true`.
- Most runtime code uses ordinary JavaScript-compatible syntax after removing type annotations.
- Next.js supports JavaScript and JSX pages/components.

However, it is not recommended as a reliability improvement. TypeScript is carrying meaningful safety here, especially around operational state models and collector payloads.

### 6.2 Risk Areas

| Area | Risk if migrated to plain JavaScript |
| --- | --- |
| Gateway state model | Union types currently constrain source names, section keys, status values, and fallback logic |
| Collector payload parsing | External systems return unstable data; TypeScript interfaces document assumptions |
| Auth/session handling | Role, surface, and username unions reduce accidental privilege or routing mistakes |
| PostgreSQL mirror | Many typed row/payload shapes reduce schema drift |
| Dashboard wallboard | Large TSX file with many typed filters, metric structures, and rendering branches |
| Admin surface | Service/session/source settings flows benefit from structured payload typing |
| Offline deployment | Removing build-time type checks increases chance of installer-only failures |

### 6.3 Migration Options

| Option | Description | Feasibility | Recommendation |
| --- | --- | --- | --- |
| Stay on TypeScript | Keep current model and improve shared types | High | Recommended |
| Hybrid JS with JSDoc | Rename selected low-risk files to `.js`/`.jsx`, keep `checkJs` | Medium | Acceptable if JavaScript is required |
| Full JS conversion | Rename all TS/TSX, remove type syntax, rely on runtime tests | Medium technically, high operational risk | Not recommended |

## 7. JavaScript Migration Implementation Plan

Use this only if the project chooses to migrate despite the recommendation.

### Phase 0: Pre-Migration Baseline

1. Freeze dependency/runtime changes until the migration branch has a passing baseline.
2. Run and record:

   ```powershell
   npm ci
   npm audit --workspaces --include-workspace-root
   npm run build
   ```

3. Capture live smoke-test coverage for:
   - operator login
   - admin login
   - gateway `/api/status`
   - WebSocket updates
   - admin services tab
   - admin sessions tab
   - collector config save
   - audit export
   - Nutanix collector dry run or controlled test endpoint
   - SolarWinds and Symphony session validation workflows

### Phase 1: Preserve Type Checking While Allowing JavaScript

1. Keep TypeScript installed.
2. For server workspaces, add `allowJs: true` and `checkJs: true`.
3. Keep `strict: true` where possible.
4. Add `// @ts-check` to migrated JavaScript files.
5. Replace interfaces and type aliases with JSDoc typedefs only where they are needed by migrated files.

### Phase 2: Migrate Low-Risk Files First

Suggested first candidates:

- Small runtime config/secrets modules.
- Frontdoor proxy.
- Isolated dashboard helpers.
- Debug scripts under collectors.

Avoid early migration of:

- `api-gateway/src/db.ts`
- `api-gateway/src/postgres.ts`
- `api-gateway/src/index.ts`
- `dashboard/src/app/page.tsx`
- `dashboard/src/app/admin/page.tsx`
- `collectors/solarwinds/src/index.ts`

### Phase 3: Introduce Shared Runtime Validation

Before converting gateway or collector payload code, add runtime schemas for external input boundaries. Good candidates:

- collector update payload
- admin settings payload
- auth login payload
- telemetry history query
- PostgreSQL mirror payload
- SolarWinds/Nutanix/Symphony normalized metric payloads

Without this step, migrating to JavaScript removes compile-time checking without adding runtime protection.

### Phase 4: Convert High-Risk Files

Convert the high-risk files only after the runtime schemas and smoke tests are in place. For each file:

1. Rename one file at a time.
2. Remove type-only syntax.
3. Add JSDoc only where it improves maintainability.
4. Run focused validation.
5. Run full build.
6. Validate installed/offline deployment when server-side runtime files change.

### Phase 5: Remove TypeScript Build Only at the End

Do not remove TypeScript until all files are migrated and `checkJs` is clean. The final step would replace `tsc` builds for server packages with a JavaScript copy/bundle strategy, then update `main`, `scripts`, deployment staging, and installer validation.

## 8. Estimated Effort

| Path | Estimated effort | Notes |
| --- | --- | --- |
| Runtime/dependency baseline only | 1-2 days | Includes npm 12 install-script policy and offline staging validation |
| TypeScript cleanup and shared type hardening | 3-6 days | Lower risk than migration |
| Hybrid JavaScript/JSDoc migration | 2-4 weeks | Depends on how many high-risk files are converted |
| Full JavaScript migration | 4-8 weeks | Requires runtime schemas and broader manual smoke testing |

## 9. Go/No-Go Criteria

Proceed with runtime/dependency updates when:

- `npm ci` succeeds without unapproved install-script warnings.
- `npm audit --workspaces --include-workspace-root` reports no actionable production issues.
- `npm run build` passes.
- Offline staging includes a working bundled Node runtime.
- `better-sqlite3`, `sharp`, and `esbuild` can be required/executed from the staged payload.

Proceed with JavaScript migration only when:

- There is an agreed business reason to leave TypeScript.
- Smoke-test coverage exists for operator, admin, gateway, collectors, and installer paths.
- Runtime validation is added for all untrusted external payloads.
- Migration is done incrementally with `checkJs` rather than a bulk rename.

## 10. Current Recommendation

Do the runtime/dependency work first. Keep TypeScript.

The highest-value implementation path is:

1. Standardize on Node.js `v26.13.0` LTS.
2. Decide whether npm `12.2.x` is required or whether the Node-bundled npm is acceptable for deployment reproducibility.
3. Approve/record npm install scripts for `better-sqlite3`, `esbuild`, and `sharp`.
4. Apply safe patch/minor dependency updates.
5. Defer major dependency migrations into separate validated workstreams.
6. Avoid a full JavaScript migration unless project constraints outweigh the added operational risk.
