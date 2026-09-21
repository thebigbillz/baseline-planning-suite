# Baseline — build plan

Weights from the brief drive the order: architecture 35, domain correctness 30, micro-frontend engineering 20,
code quality 15. Visual polish is not scored, so the designs are implemented plainly.

## Decisions (each defended in the README)

| Choice the brief leaves open | Decision | Why |
| --- | --- | --- |
| Bundler | webpack 5, first-party `ModuleFederationPlugin`, swc for TS | Module Federation is native to webpack. The part that must not break uses no third-party plugin. |
| Remote resolution | Shell fetches `/config.json` at runtime; the shell container writes it from env vars at start | URLs never enter a bundle. Changing a remote is a container restart, not a rebuild. |
| Remote contract | Each remote exposes one module, `./mount`: `mount(el, hostContext) → { update, unmount }` | The shell never imports a remote's components. Currency and user are pushed in through `update`. |
| Standalone + hosted | One build emits `index.html` (standalone, with a small harness bar) and `remoteEntry.js` (hosted) | Same artefact, two entry points. |
| Singleton | `react` and `react-dom` shared as `singleton`, `strictVersion`, not eager; async bootstrap in every app | One React at runtime, a loud failure if versions drift. |
| Data layer | Each team owns a tiny HTTP service: `people-api`, `delivery-api` (Node, zero dependencies) | One owner per piece of data. The published contract is the HTTP API, never another team's code or storage. |
| Persistence | JSON document per service on a Docker volume, seeded from the fixture on first start | Survives reloads and container restarts, inspectable, no database to operate. |
| Transport between remotes | `BroadcastChannel('baseline')` carrying small notices (`rates-changed`, `load-changed`); receivers refetch through the owner's API | Notices carry no data, so the API stays the single source of truth. Works across tabs too. |
| Pricing (the assessed decision) | Delivery reads People's rate records and computes cost itself | Delivery must show slices and the blended rate, price while typing, and keep working when People's UI is down. People owns the *facts* (rates); Delivery owns the *plan arithmetic*. |
| Canonical unit | Person-months | Capacity is then a plain sum across projects (100% = 1.00) with no dependency on People's data. |
| Over capacity in People | People reads `GET /api/delivery/load` (load per person per month) | People never reads allocations. |

## Repository shape

```
apps/shell      host: navigation, display currency, active user, remote loading, failure panels
apps/people     remote: register, rate history
apps/delivery   remote: work breakdown, staffing grid, pricing
  src/domain    pure TypeScript, no React, no DOM — calendar, rates, units, rounding, rollup, capacity
services/people-api, services/delivery-api
packages/contracts   types and event names only, no logic
packages/tokens      one CSS file of design tokens
infra/               nginx configs, config.json entrypoint
```

The two remotes never import each other. Both may import `packages/contracts` (types) and `packages/tokens` (CSS).

## Order of work

1. Domain engine in `apps/delivery/src/domain` with tests; the brief's five reference numbers first.
2. Contracts, the two services, seed loading.
3. webpack + Module Federation: shell, runtime config, mount contract, failure isolation, `?break=`.
4. Delivery UI: tree (create, rename, move, delete, R4 move-to-child), grid, four units, docked inspector, flags.
5. People UI: searchable register, rate history add / correct / remove, load from Delivery.
6. Cross-remote live update, standalone harness, Docker compose on :8080.
7. README: run, break a remote, repo map, decisions.

## Brief checklist

- [ ] R1 effective-dated rates, month slices, `validFrom` inclusive, Mon–Fri, zero cost + marked before first rate
- [ ] R2 four units, one stored; € edit divides by blended rate; fixed precision; lossless round trip
- [ ] R3 totals from exact values; largest-remainder so displayed cells add to displayed total
- [ ] R4 parents derived, read-only; adding a child under a staffed leaf moves its allocations (never silent loss)
- [ ] R5 capacity across all projects; People shows oversubscribed; Delivery names the latest-edited allocation; never blocks
- [ ] Shell navigation, currency, user pushed at runtime
- [ ] People search, rate add / correct / remove incl. retroactive
- [ ] Delivery tree CRUD + move; every leaf cell editable
- [ ] Rate edit reaches open Delivery cost view with no reload
- [ ] Remote failure isolated; trigger provided
- [ ] No UI libraries; TypeScript strict; no `any`
- [ ] Three federated builds; runtime URLs; standalone and hosted from one build
- [ ] `docker compose up` → localhost:8080, no Node on host
- [ ] README, repo map, tests on calculation logic without React, real commit history
