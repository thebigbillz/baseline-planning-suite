# Baseline — design notes

Every number on the boards is computed from `baseline-seed.json` using the brief's rules (R1–R5).

## Direction: "Calm workspace" (v3)

Visual polish is not scored, so the design's job is to make the *scored* things legible: who owns what,
and whether the arithmetic is right.

- **Layout.** A shell sidebar holds navigation (People, Delivery, a status dot per remote). When Delivery is open
  it mounts a project block there: a "Find a project" search directly under the navigation, recent projects beneath
  it, and a footnote at the foot with total projects and work items. Results open downward in a popover. A slim top strip holds display currency and active user.
- **Tree and grid are one surface**, as in the brief's Figure 5: work items roll up in place, people sit under the
  lowest level, seven months per page, 40px rows. The selected cell docks its explanation below the grid.
- **Scale.** Projects are a search, never a list. Branches start collapsed and only expanded rows render.
  Header, first column and total stay pinned. Over-capacity flags bubble up to collapsed parents, and the toolbar
  chip jumps to the next one. People are assigned through a search that shows their load first.
- **Type and ground.** IBM Plex Sans, Plex Mono (tabular) for figures. White surfaces on warm grey `#F6F6F3`.
- **One accent, one alert.** Cobalt `#2F4DA3` = selected / interactive / priced. Rust `#A9531F` = over capacity,
  destructive, errors. Flags use tint + colour + a ring mark, never colour alone.
- **Buildable by hand.** Flex rows, plain inputs, docked panels, native `<dialog>`. No table, grid, tree or
  headless package is implied.

## Boards

| Section | Boards |
| --- | --- |
| Delivery: plan, price, flag | Grid + rate breakdown (reference calculation) · Editing a cell in cost (live conversion, R2) · Capacity conflict (R5) |
| Delivery: structure and scale | No project chosen (Projects list) · Project search in the sidebar · Assign a person · Work item menu + move picker · Add child under a staffed leaf (R4) |
| People | Register and rates · Edge states: duplicate start date, delete a rate, Delivery unavailable |
| Shell and system | Delivery failed to load · Delivery running standalone (harness bar) · Who owns what (contracts) |
| Foundations | Colour, type, controls, space · Ten cell states and five work-item-row states |

## Decisions worth defending in the walkthrough

1. **Derived vs editable is visible at rest.** Derived rows are tinted and bold; person rows under a leaf are
   white. Hover only confirms what the eye already knows.
2. **Unit switch is a view, never a write.** The hint beside the switch states the conversion. Switching there
   and back cannot change the stored person-months because nothing is stored on switch.
3. **The reference calculation is on screen.** Selecting a cell docks its working-day slices, per-slice cost and
   blended rate (Adaeze Okafor, Mar 26: 32 h × €80 + 56 h × €95 = €7,880.00, blended €89.5455/h). An assessor can verify R1/R2 without devtools.
4. **Over capacity is flagged three ways** (tint, colour, ring mark) and never blocks. The docked panel names the
   causing assignment (latest edit), lists contributions from projects that are not open, and offers computed
   fixes (reduce to 0.41 PM, move 0.18 PM to July, or keep and stay flagged).
5. **"Applies" is derived text, not a field.** Rate rows show "until 9 Sep 2026" computed from the next record,
   matching the data model (no end date to get wrong).
6. **Retroactive edits say so.** The correction row states the period it reprices and that open Delivery cost
   views update on save.
7. **Rates are entered in the stored currency (EUR).** Display currency, owned by the shell, affects reading only.
8. **People never reads allocations.** Load per person-month arrives from Delivery through a published contract;
   if Delivery is down, that block degrades to "load unavailable" and the register still works.
9. **Move is a picker, not drag and drop.** Keyboard-complete, realistic without a library, and lets invalid
   targets (level 4, own descendants) be shown disabled with the reason.
10. **Breaking a remote is a product feature.** User menu → Resilience check, mirrored by `?break=delivery`.
    The failure panel shows the entry URL came from runtime config.
11. **Distinct "nothing" states.** Empty (`·`), before first rate (`NO RATE`, cost zero, effort kept), and outside
    project dates (hatched, skipped by keyboard) are three different things.

12. **Entering Delivery.** Returning users reopen their last project (remembered per active user; the URL carries
    the project). With none to reopen, they land on a paged Projects list, never an arbitrary default or a bare
    "search for something" state.
13. **Scope line.** "+ New project" exists as a button only. Project creation is not in the brief, so no create
    flow or empty-project state is designed.

14. **R4 in the fixture.** Every staffed leaf in the seed is already on level 3, so adding beneath one is refused
    by the three-level limit. The move-the-plan dialog appears for a staffed leaf on level 1 or 2, for example a
    new work item that was staffed before being broken down.

## Tokens

| Token | Value |
| --- | --- |
| app ground / surface / sunken | `#F6F6F3` / `#FFFFFF` / `#F3F4EE` |
| border / border-strong | `#E6E5E0` / `#DDDCD5` |
| text / text-2 / text-3 | `#161B2E` / `#3A4052` / `#5B6172` |
| accent / accent-tint | `#2F4DA3` / `#E9EEF9` |
| alert / alert-tint | `#A9531F` / `#F8ECE2` |
| success | `#2F7A4F` |
| grid metrics | row 40px · name col 320px · month col 100px · 7 months per page · sidebar 232px |
