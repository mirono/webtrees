# Phase 5, step 24: `/tree/{tree}/family-list` (FamilyListModule)

**Status: done (2026-10-16); unit-test-verified and live-verified against the real "ophir" tree.**

## What this is

The fifth **list** route this migration has ported, and the first **full
fidelity** one - an explicit user decision over the "simple list" family's
deliberate DataTables-to-plain-table simplification (Repository/Source/
Note/Location, steps 20-23). `FamilyListModule`
(`app/Module/FamilyListModule.php`) extends `AbstractIndividualListModule`
(`app/Module/AbstractIndividualListModule.php`, 759 lines) - the
surname-index/given-name-sublist machinery it shares with
`IndividualListModule` (not ported). Only the `showFamilies() === true`
code paths are implemented here; `IndividualListModule` would need its own
`fams=false` variant of every query.

## Why "full fidelity" turned out more tractable than first feared

The original scoping worry was `I18N::language()->normalize()`/
`initialLetter()`/`alphabet()` and `I18N::compare()` being "ICU-coupled,
not portable" (the same reasoning that ruled out porting other `app/`
territory during phase 4/5's earlier survey passes). It turned out NOT to
apply here:

- This install has **no language setting configured anywhere** (confirmed
  via the DB - no `wt_site_setting`/`wt_gedcom_setting` row for it), so
  `I18N::language()` always resolves to the default (English) language
  module, which overrides neither `normalize()` nor `initialLetter()` nor
  `alphabet()` (`app/Module/ModuleLanguageTrait.php`'s own default
  implementation). `normalize()` is plain Unicode NFKD decomposition +
  stripping combining marks (`String.prototype.normalize('NFKD')` +
  `\p{M}` regex removal); `initialLetter()` is just the first Unicode
  character; `alphabet()` is a fixed A-Z array.
- `I18N::compare()` DOES want real ICU collation - but Node ships full ICU
  by default (unlike PHP's optional `intl` extension), so `Intl.Collator`
  is a genuine equivalent, not an approximation.
- `I18N::textScript()` (used for primary-name selection, not collation) is
  a plain Unicode code-point range table (`app/I18N.php`'s
  `SCRIPT_CHARACTER_RANGES`) - directly portable.

The real size driver turned out to be `families-table.phtml` itself: 14
columns, 3 groups of DataTables filter-checkbox buttons (alive/dead,
roots/leaves, marriage status), hidden filter-encoding columns, a
toggle-parents footer - far bigger than any list route's row rendering so
far.

## Implementation

Landed as 12 separate commits on `feature/family-list-module`, each
independently tested, in dependency order:

1. **`collation.mjs`** (new): `normalize()`/`initialLetter()`/`alphabet()`/
   `compare()`/`strtoupper()`/`textScript()` - see above.
2. **`individual.mjs`**: `extractAllNameFacts()` now tags a `1 NAME` fact
   with `2 TYPE MARRIED` as type `'_MARNM'`
   (`GedcomRecord::extractNamesFromFacts()`'s own special case); new
   `getPrimaryNameIndex()` ports `GedcomRecord::getPrimaryName()`'s
   script-based tie-break (always resolves to Latin script here, since no
   language module overrides it).
3. **`family.mjs`**: `numberOfChildren()`, `getAllMarriageDates()`/
   `getMarriageDate()` (tries `MARR` then `_NMR`, returns every dated fact
   of whichever tag has one - never mixes tags), `hasMarriageFact()`/
   `hasDivorceFact()`. **`index.mjs`**: `resolveFamilyMember()` now also
   computes `canShowNameOnly` via `canShowName()` (`Family::husband()`/
   `wife()`'s own weaker gate - a living individual's name can show even
   when the full record can't, per `SHOW_LIVING_NAMES`) - additive, no
   existing caller's behavior changed.
4. **`family-list.mjs`** (new): `surnameData()`/`allSurns()`/
   `allSurnames()`/`surnameInitials()`/`givenNameInitials()` - the
   surname-collation query layer, for the `fams=true` case only (every
   query joins `wt_link` on `l_type = 'FAMS'`). `familyXrefsForSurnames()`
   collapses PHP's own two-step `individuals()` -> `families()` into one
   query, since `FamilyListModule`'s row rendering never needs to know
   WHICH name fact matched (unlike `IndividualListModule`, which sets each
   individual's *primary* name to the matched one for display).
5. **`family-list.mjs`**: `resolveListRequest()` ports the non-DB half of
   `handle()` (query-param normalization/redirect, the "surname doesn't
   exist" redirect, the full `show`/`show_all`/`alpha`/`falpha` branching
   chain that builds the legend/title). `needsGivenNameSublist()` ports the
   `SUBLIST_TRIGGER_I` threshold check. `familyListUrl()` mirrors
   `listUrl()` for the no-xref case.
6. **`family-list-view.mjs`** (new): `renderSurnamesTable()`/
   `renderFamiliesTable()` render the REAL `surnames-table.phtml`/
   `families-table.phtml` markup (`datatables` class + `data-columns`/
   `data-sorting` attributes, the 3 filter-button groups, hidden
   filter-encoding columns, toggle-parents footer) - the already-bundled
   `webtrees.min.js` DataTables init code
   (`document.querySelectorAll('table.datatables')...`,
   `resources/js/webtrees/init.js`) picks this markup up automatically, so
   no hand-rolled sort/search/filter JS was needed, only matching HTML.
7. **`family-list.mjs`**: `filterSurnamesForAlpha()`/`computeSurnsToShow()`
   port the `switch ($alpha)` surname-selection filter shared by the
   surnames-table body and the given-name-sublist count.
8. **Routing**: `matchFamilyListPagePath()` (`routes.mjs`),
   `isFamilyListPagePath()` (`proxy/routing.mjs`) - same exact-match shape
   as every other list route. Also filled a real pre-existing test gap
   found along the way: `matchLocationListPagePath()` (step 23) had no
   test coverage anywhere.
9. **`family-list.mjs`**: `loadFamilyListPrefs()` - `SURNAME_LIST_STYLE`
   (default `'style2'`) / `SUBLIST_TRIGGER_I` (default `'200'`), with the
   same "missing row falls back to the PHP default, an explicit empty
   value does not" distinction `loadShowLastChangePref()` elsewhere
   already has to make.
10. **`index.mjs`**: `handleFamilyListPage()` ties everything together -
    module gating, the surname-data query, `resolveListRequest()`,
    per-family privacy resolution (reusing the existing
    `resolveShownFamily()`), full `families-table` row building (ages via
    `lib/age.js`'s `Age` class, marriage dates/places, the 3 hidden
    filter-encoding columns).

## Module gating

`FamilyListModule` has **no `$access_level` override** of its own -
`AbstractModule`'s own class default, `Auth::PRIV_PRIVATE` = 2
("visitor"), applies - confirmed live: no `wt_module_privacy` override row
for `family_list` in this tree, and `module_name = 'family_list'` is
`enabled`. Same default-level reasoning as `NoteListModule` (step 22),
unlike Repository/Source/Location's member-only default.

## `SURNAME_LIST_STYLE`/`SUBLIST_TRIGGER_I` for this tree

Confirmed via the DB: no override row for either preference, so the real
PHP defaults apply - `'style2'` (the plain surname table, the one this
port renders; `'style1'` column-list and `'style3'` tag-cloud are
deliberately NOT ported - not used by this tree) and `'200'`. With 6949
individuals in "ophir", the `200` threshold is genuinely reached for
common surnames, so the given-name sublist is real, exercised
functionality here, not a rare edge case.

## Deliberate, documented simplifications

- Husband/wife's DataTables sort key uses the plain `sortName()` string
  rather than PHP's own reversed/`AAAA`-substituted variant
  (`families-table.phtml`'s own `str_replace([',', ...], 'AAAA', implode(',',
  array_reverse(explode(',', $husb->sortName()))))`) - this only affects
  the exact secondary tie-break order within a hidden DataTables sort
  column, never what's actually displayed.
- An `Age` is skipped entirely (blank cell, `data-sort="0"`) rather than
  constructed with an invalid-date shim when either side (birth date or
  marriage date) has no usable date - the SAME precedent
  `individual.mjs`'s own `ageString()` already establishes for the "no
  birth date" case, applied consistently here to marriage-date gaps too.
- The marriage-date and last-change DataTables sort keys use
  `GedcomDate.julianDay()` rather than PHP's own
  `Family::lastChangeTimestamp()` (a full TIME-subtag-to-Unix-timestamp
  conversion, not built anywhere in this migration) - same relative
  ordering behavior for same-day entries, not byte-identical.

## Live verification

Against the real "ophir" tree (6949 individuals, 573 sources, etc.):

- Anonymous (visitor) access returns 200, matching the visitor-level
  default module gate.
- `/tree/ophir/family-list` (no params): surname-initials nav renders with
  real counts (e.g. one surname matches 1526 spouse-name rows).
- `?alpha=S`: surnames-table renders real surname spellings
  (SACHI/SACHSE/SACKS/SADE/...), each linking to its own `?surname=...`.
- `?surname=SACKS`: families-table renders a real married couple (Solomon
  Sacks / Esther Fanny Brenner) with correct sex icons, correct "no"
  marriage-date fallback, correct hidden filter-encoding columns (`U`
  unmarried, `Y` both dead), `Last change` column correctly suppressed
  (`SHOW_LAST_CHANGE` default off for this tree), real `data-columns`
  DataTables config.
- `?alpha=%40` (unknown surname), `?alpha=%2C` (no surname),
  `?show_all=yes&show_all_firstnames=yes` (the full 692-family list) all
  return 200 with no server errors.
- `?surname=NOPE123456` (a surname that doesn't exist) redirects 302 to
  the bare list, matching the "surname doesn't exist" flash+redirect.

Full JS suite: 4918 tests, green throughout. No regressions in any
previously-shipped route.

## What's next

`MediaListModule` remains - folder/filter/pagination-based, no DataTables
config at all, a different shape entirely from every route ported so far.
`IndividualListModule` (the OTHER `AbstractIndividualListModule` subclass)
would reuse most of this step's infrastructure directly, needing mainly
its own `fams=false` query variants and an `individuals-table.phtml` port
(not attempted here - out of scope for this step).
