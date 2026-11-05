# Phase 5 step 35: TimelineChartModule

`/tree/{tree}/timeline-{scale}` — served entirely by Node. The EIGHTH
chart route, and (like Lifespans) a free-form ACCUMULATED set of
individuals rather than one root with generations — but here EVERY
dated fact of every selected individual (not just birth/death), plus
every dated fact of each of their own spouse families, gets plotted on
one shared vertical timeline with a collision-avoidance placement
algorithm.

## Shape: every dated fact, not just vital ones

Real PHP's `chart()` (`app/Module/TimelineChartModule.php:214-271`)
walks each selected individual's OWN facts AND every one of their
spouse families' own facts, keeping every one with a usable date
except a short `NON_FACTS` denylist (`FAM:CHAN`,
`INDI:BAPL/CHAN/ENDL/SLGC/SLGS/_TODO`) — MARR, RESI, OCCU, EDUC,
CENS, a custom `_EVEN`, anything with a date shows up. Ported as
`collectIndividualTimelineEvents()` (`pages-server/timeline-chart.mjs`),
reusing `resolveShownFamily()` unchanged (the same shared family-
load/privacy/member-resolution function the Individual page's own
Facts-tab family-merge already uses) for the spouse-family half.

A real same-fact-twice bug real PHP itself guards against
(`$indifacts->uniqueStrict(fn ($fact) => $fact->id())`): if BOTH
spouses of a family are in the selected set, each one's own
"own facts + spouse families' facts" pass would discover that
family's MARR fact independently. Ported as a dedup key
(`FAM:<family xref>:<tag>:<raw fact text>`) that's identical
regardless of which spouse's own pass found it first — confirmed by a
unit test that processes the same family from both spouses' sides and
checks the two produce the same key.

## The Y-position placement algorithm, ported exactly

Each event's natural vertical position comes from its Gregorian
year/month/day — `GregorianCalendar.jdToYmd()` on the date's own
`minimumJulianDay()`, the same calendar-independent-via-Julian-day
approach real PHP's own `new GregorianDate($date->minimumJulianDay())`
uses, so this works correctly regardless of the fact's original
calendar (Hebrew/Julian/French/Hijri/Roman/Jalali all convert through
the same Julian day number). If an event's natural "slot" (one
`bheight`-tall row) is already occupied, real PHP bounces it
alternately further down then further up until it finds a free one —
ported verbatim in `layoutTimelineEvents()`, including the exact
`i`/`j` stepping and the diagonal-connector-box geometry that visually
shows how far a box got bumped from its natural position.

## Color assignment

A family event's color follows the husband if the husband is one of
the SELECTED individuals, else the wife; an individual event follows
that individual — all indexed against the ORIGINAL (not date-sorted)
selected-xrefs order, then wrapped to 8 (`timelineColorIndex()`).
When more than 8 individuals are selected, each box is prefixed with
its owner's name (matching real PHP: with only 8 colors available,
names become the only way to tell people apart).

## Scope cut: the drag-to-explore JS

Real PHP's `chart.phtml` ships two mouse-drag interactions: a
draggable "age cursor" per individual (drag it anywhere on the
timeline to read that individual's age at that point), and draggable
repositioning of any fact's own box. Unlike every other chart's own
client-side JS so far — Hourglass's lazy-load arrow, Fan's popup
menu — both are pure visual-exploration aids that change nothing
about what data is shown; neither is ported. The static chart (every
fact's own position, label, date, place, age-at-marriage, and color)
is otherwise complete.

## Reused infrastructure

- `resolveShownFamily()` for the spouse-family half of event
  collection (same function `familyFactsForIndividual()` already
  uses for the Individual page's own Facts tab).
- `GedcomDate`/`GedcomDate.compare()` for date parsing and the
  FactComparator::byDate()-equivalent sort — this port's own subset
  skips real PHP's type-based tie-break for two facts sharing the
  EXACT same date (a minor, documented simplification; it only
  affects the display order of simultaneous events).
- `Age` (`lib/age.js`) for each spouse's own age at a family event,
  shown next to EVERY family-type event with a spouse of known birth
  date (not just marriage — matching real PHP's own unconditional
  `foreach ($record->spouses() as $spouse)` loop for any
  `Family`-owned event).
- `buildChartBoxViewModel()` for each selected individual's name/sex/
  URL (same "fresh `isSelfRecord` per individual, no shared root"
  privacy-correctness fix already made for Lifespans — Timeline has
  no root either).
- `displayDate()` for each event's own formatted date text.

## UI simplification

The "Add individual" field is a plain text input, not real PHP's own
TomSelect-backed select — the same simplification already used for
every individual-xref field on every other chart's own options form.

## Live verification

Against the real "ophir" tree:

- Full page (200) with zero, one, and two selected individuals;
  genealogy-menu bar present.
- Ajax body for one individual: 5 correctly labeled/dated/placed
  events (Birth/Event/Graduation/Death/Burial).
- Ajax body for a married couple: the shared family's MARR and RESI
  facts both appear exactly once each (not duplicated), each showing
  both spouses' correct ages at that event ("Husband's age 27 years",
  "Wife's age 24 years" at their own 1962 marriage).
- Zoom in/out links on the full page compute the correct new scale
  (10→15/5); scale clamps correctly at both the 1 and 200 boundaries.
- `addxref`-equivalent `add` POST → 302 redirect carrying the new
  xref appended to the existing set; remove-individual links on the
  full page correctly carry every xref EXCEPT the one being removed.
- `400` for an out-of-range scale, `405` for an unsupported method,
  `302` for a nonexistent tree.
- No errors in `pages` container logs across all of the above.

5236 tests passing (up from 5206), zero regressions.

## Next candidates

Relationships, Statistics, PedigreeMap - each a different shape again
(a relationship-path graph search between two individuals; a block-
configuration-driven stats renderer; map-tile marker plotting) and
each needs its own scoping pass before porting.
