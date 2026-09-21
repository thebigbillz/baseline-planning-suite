# Baseline Planning Suite

Who is working on what, for how long, and what it costs. Three federated builds: a **shell** that hosts,
**People** (the register and cost rates) and **Delivery** (the work breakdown, the staffing grid and the price
of the plan). People and Delivery never import each other's source.

## Run it

```bash
docker compose up
```

Then open <http://localhost:8080>. Nothing else is needed on the host.

| Address | What it is |
| --- | --- |
| <http://localhost:8080> | The suite: shell hosting both remotes |
| <http://localhost:8081> | People, standalone, from the same build the shell loads |
| <http://localhost:8082> | Delivery, standalone, from the same build the shell loads |

Edits are stored on Docker volumes and survive reloads and restarts. `docker compose down -v` returns to the
fixture.

**Check the reference calculation:** open Delivery → *Ledger Consolidation* → expand *Ledger migration* →
*Discovery* → *Design* → select **Adaeze Okafor, Mar 26**. The panel under the grid shows 22 working days split
8 / 14, 88.00 h, 50.0%, **€7,880.00** and a blended rate of **€89.5455/h**. Switch the unit to *Cost* and type
into the cell to see a cost become person-months before it is saved.

## Break a remote on purpose

Any of these; the shell stays up and says so in place of the panel, with *Try again*:

1. `docker compose stop delivery` (or `people`), then open or reload that remote. `docker compose start delivery`
   and *Try again* brings it back.
2. Open <http://localhost:8080/delivery?break=delivery> (or `?break=people`).
3. In the suite: user menu (top right) → *Resilience check* → switch a remote off → reload.

Options 2 and 3 point the loader at an address that does not exist, so they exercise the same failure path as a
container that is really down. With Delivery down, People still works, and only its load figures degrade to
"not available".

## Map of the repository

```
apps/
  shell/        host: sidebar navigation, display currency, active user, remote loading, failure panel
    src/remotes/    loadRemote (container API), RemoteSlot (isolation), breakSwitch
  people/       remote: searchable register, rate history (add, correct, remove)
    src/domain/     rate periods, validation, what an edit reprices      ← pure TS, tested
  delivery/     remote: work breakdown + staffing grid, four units, pricing, capacity
    src/domain/     calendar, rates, pricing, units, rounding, breakdown, capacity, grid   ← pure TS, tested
    src/data/       Delivery's service client, People's directory client, notices
    src/ui/         hand-built grid, inspector, pickers, dialog
services/
  people-api/   owns employees and rate records        (Node, zero dependencies)
  delivery-api/ owns projects, work items, allocations (Node, zero dependencies)
packages/
  contracts/    what the three agree on: types and names only, no logic
  tokens/       design tokens as CSS custom properties
infra/          Dockerfiles, nginx configs, /config.json writer, dev runner
seed/           the fixture, loaded by each service on first start
docs/           design notes and the build plan
```

## Decisions

### Delivery prices its own grid from People's rate records

The brief leaves this open and says it is the decision being assessed. **Delivery reads rate records from
People's published API and computes cost itself.** People does not offer a "price this" endpoint.

- *People owns facts, Delivery owns arithmetic.* A rate record is a fact about a person. "What does 0.50
  person-months in March cost" is a planning question: it needs working days, the even spread of effort, the
  slicing of a month. None of that is People's business, and People should not have to change when planning
  rules do.
- *The UI needs the working, not just the answer.* The grid shows rate slices and the blended rate, converts a
  typed cost to person-months while you type, and reprices 700 cells on a unit switch. Doing that through
  another team's endpoint would mean a chatty API or a bulk endpoint shaped by Delivery's screen.
- *Failure stays local.* If People's UI is down, Delivery still prices. If People's service is down, Delivery
  still shows person-months and capacity and says why costs are missing.
- *What it costs:* Delivery depends on the shape of a rate record and on the rule that a record runs until the
  next one starts. That rule is part of the contract (`packages/contracts`), and it is small and stable.
  If rates ever became sensitive data that Delivery's users may not see, I would revisit this and have People
  return priced slices instead.

### One owner per piece of data

| Data | Owner | Published as |
| --- | --- | --- |
| Employees, rate records | People (`people-api`) | `GET /api/people/directory` |
| Projects, work items, allocations | Delivery (`delivery-api`) | private; `GET /api/delivery/load` publishes only load per person per month |
| Display currency, active user, remote health | Shell | pushed into remotes through `mount()` / `update()` |

People flags oversubscription from `/api/delivery/load`. It never sees an allocation, a project or a work
item. The canonical unit is **person-months**, which makes capacity a plain sum across projects
(100% = 1.00) with no dependency on People's data at all.

### Transport between remotes

A `BroadcastChannel` carries notices: `rates-changed`, `load-changed`. **Notices carry no data.** The receiver
refetches through the owner's API, so the API stays the single source of truth and a missed notice can never
leave someone with wrong numbers, only stale ones until the next fetch. It also reaches other tabs. The shell
keeps a visited remote mounted, so a Delivery cost view you have open really is open when you edit a rate in
People; it reprices and says so, with no reload.

### Persistence

Each service keeps one JSON document on a Docker volume, written atomically (temp file, then rename), seeded
from the fixture on first start. It survives reloads and restarts, can be read with `cat`, and needs nothing to
operate. Browser storage was the alternative; I rejected it because standalone remotes run on other origins,
and because "both teams read the same localStorage key" is a shared database with no owner.

Delivery's service applies **change sets** atomically and stamps `updatedAt`. Every planning rule lives in the
tested domain and arrives as a change set; the service persists. There is no auth in scope, so it trusts its
client; with auth, the same domain module would run server-side too.

### Bundler: webpack 5

Module Federation is native to webpack. For the part of the system that must not break, I chose the
first-party plugin and the documented container API over a newer bundler with a federation plugin. swc handles
TypeScript, so builds stay fast.

### Micro-frontend mechanics

- **Runtime remote URLs.** The shell declares no remotes at build time. Its container writes `/config.json`
  from `PEOPLE_REMOTE_URL` / `DELIVERY_REMOTE_URL` when it starts (`infra/nginx/write-config.sh`); the shell
  fetches it and injects the entry script (`apps/shell/src/remotes/loadRemote.ts`). Re-pointing a remote is a
  restart, not a rebuild.
- **Contract.** Each remote exposes exactly one module, `./mount`:
  `mount(element, hostContext, slots?) → { update, unmount }`. The shell never imports a remote's components.
  `slots.sidebar` lets Delivery render its project search inside the shell's sidebar without the shell knowing
  what a project is.
- **Singleton.** `react` and `react-dom` are shared as `singleton` + `strictVersion`, never eager, and every app
  has an async bootstrap. One React at runtime; a version drift fails loudly instead of loading two.
- **Standalone and hosted from one build.** Each remote build emits `index.html` (standalone) and
  `remoteEntry.js` (hosted). Standalone, a small harness bar supplies the currency and user and calls the same
  `mount()`, so both modes run one code path. `publicPath: 'auto'` makes chunks load from wherever the host
  found the entry file.
- **Isolation.** Load failures are caught per slot. Each remote renders with its own React root and its own
  error boundary, so a render error in one can never unmount the shell or the other remote. nginx resolves
  upstreams per request, so the shell's container starts even when a remote's container does not exist.

## Domain rules, and where they live

All in `apps/delivery/src/domain`, pure TypeScript, no React, no DOM.

| Rule | Module | Notes |
| --- | --- | --- |
| R1 effective-dated rates | `calendar`, `rates`, `pricing` | Mon–Fri, holidays ignored, `validFrom` inclusive, any number of slices. Days before the first rate cost zero and the cell is marked `no rate`. |
| R2 four units | `units` | Person-months stored; hours, % and cost are conversions. A typed cost ÷ blended rate → hours → person-months. The blended rate does not depend on the amount, so an empty cell can be edited in cost. Committing unchanged text writes nothing. |
| R3 totals | `rounding`, `grid` | Every leaf cell is an atom. Atoms are apportioned once, by largest remainder, against the project total rounded from exact values. Every other figure (parents, row totals, month totals) is a sum of displayed atoms, so the screen reconciles in both directions, and paging or collapsing never changes a figure. |
| R4 derived parents | `breakdown` | Adding a child under a staffed leaf **moves** its allocations onto the child, after a dialog that shows what moves. Moving an item under a staffed leaf is **refused** with the count. No path loses data silently. |
| R5 capacity | `capacity` | Summed over every project. The cause is the most recently edited contributing allocation (`updatedAt`, set by the service). Flagged in the cell, on collapsed ancestors, in the toolbar and in People; never blocked. |

## Tests

```bash
npm install
npm test          # 74 tests, none mounts React
npm run typecheck # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, no `any`
```

`reference.test.ts` asserts the five numbers of the brief's Figure 4. The rest covers a rate change landing on
a weekend, months before the first rate, lossless unit round trips, cost edits where no rate applies,
floating-point traps in largest-remainder (`0.29 × 100`), R4 moves and refusals, the fixture's six overloaded
person-months, and that displayed parents equal the sum of displayed children in every unit. I did not test
React components: the logic worth defending is outside them.

## Develop without Docker

```bash
npm install && npm run dev   # Node 22.18+; shell :8080, people :8081, delivery :8082
```

## No UI libraries

The grid, tree, menus, pickers, comboboxes and dialog are hand-built from native elements (`<dialog>`,
`<input>`, `<button>`, flex rows, ARIA grid roles). Runtime dependencies are `react` and `react-dom` only.
Styling is CSS Modules plus one file of tokens.

## Known limits, and what I would do next

- Rows are only rendered when expanded, which is enough for the fixture. At thousands of visible rows the grid
  needs windowing; the flat row list from `buildGrid` is already the right shape for it.
- A person assigned to a leaf appears as a row immediately but is persisted with their first non-zero cell.
- Project creation is out of scope: projects come from the fixture.
- Display currencies use fixed demonstration rates owned by the shell. Rates are entered in EUR.
- Public holidays are ignored, as the brief says.
- Two people editing at once: last write wins per cell. Change sets are small, so the next step would be a
  version number on the plan and a rebase on conflict.
