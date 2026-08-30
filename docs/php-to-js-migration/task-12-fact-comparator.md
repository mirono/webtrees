# Task 12 — Port `Date::compare()` and `FactComparator` (byDate/byType/typeOrder/effectiveTag)

**Priority:** 12
**Complexity:** Medium
**Status:** Done
**Unblocks:** Nothing — this completes the facts-sorting pipeline; live PHP call sites at `app/GedcomRecord.php:577-578`, `app/Services/FactSortService.php`, `app/Services/GedcomEditService.php`, `app/Module/TimelineChartModule.php` are high-traffic but bridging is out of scope.

---

## Phase 0 — Why this one, twelfth

`FactComparator` is the real payoff: it combines `Date::compare()` (pure Julian-day arithmetic) and `TagComparator` (already ported in task 3) to sort genealogy facts chronologically, then by event type. It's deferred until both dependencies exist:
- Task 3 ported `TagComparator::order()` / `byOrder()`.
- Tasks 7–11 ported the Date engine (`app/Date/*.php` calendar classes).
- Task 11 added a wrapper (`app/Date.php::Date`) that parses GEDCOM date strings.

Now both are ready. This task splits the work into two clean pieces:
- **Part A:** Port `Date::compare()` (pure JD arithmetic, no DB or calendar dependencies).
- **Part B:** Port `FactComparator` (uses Part A + TagComparator; needs PHPUnit stub machinery to characterize).

**Files:**
- Part A: `app/Date.php::Date::compare()` → `lib/date-compare.js`
- Part B: `app/Comparators/FactComparator.php` → `lib/comparators/fact-comparator.js`

**Characterization:**
- Part A: Plain `bin/characterize_date_compare.php` (no DB, Date standalone).
- Part B: PHPUnit test (`tests/Unit/Comparators/FactComparatorCharacterizationTest.php`) using stub machinery — only way to construct real `Fact` objects.

## Source (current PHP)

### Part A: `app/Date.php::Date::compare()` (lines 337–385)

```php
public static function compare(Date $a, Date $b): int
{
    // Get min/max JD for each date.
    switch ($a->qual1) {
        case 'BEF':
            $amin = $a->minimumJulianDay() - 1;
            $amax = $amin;
            break;
        case 'AFT':
            $amax = $a->maximumJulianDay() + 1;
            $amin = $amax;
            break;
        default:
            $amin = $a->minimumJulianDay();
            $amax = $a->maximumJulianDay();
            break;
    }
    switch ($b->qual1) {
        case 'BEF':
            $bmin = $b->minimumJulianDay() - 1;
            $bmax = $bmin;
            break;
        case 'AFT':
            $bmax = $b->maximumJulianDay() + 1;
            $bmin = $bmax;
            break;
        default:
            $bmin = $b->minimumJulianDay();
            $bmax = $b->maximumJulianDay();
            break;
    }
    if ($amax < $bmin) {
        return -1;
    }

    if ($amin > $bmax && $bmax > 0) {
        return 1;
    }

    if ($amin < $bmin && $amax <= $bmax) {
        return -1;
    }

    if ($amin > $bmin && $amax >= $bmax && $bmax > 0) {
        return 1;
    }

    return 0;
}
```

### Part B: `app/Comparators/FactComparator.php` (lines 29–94)

```php
final class FactComparator
{
    public static function byDate(Fact $first, Fact $second): int
    {
        if ($first->date()->isOK() && $second->date()->isOK()) {
            $result = Date::compare($first->date(), $second->date());

            // Same date? Use type as a tie-break.
            if ($result === 0) {
                $result = self::byType($first, $second);
            }

            return $result;
        }

        // One or both events have no date - stable sort preserves original order.
        return 0;
    }

    public static function byType(Fact $first, Fact $second): int
    {
        $first_tag  = self::effectiveTag($first);
        $second_tag = self::effectiveTag($second);

        // Same type: dated before undated, otherwise preserve original order.
        if ($first_tag === $second_tag) {
            if ($first->attribute('DATE') !== '' && $second->attribute('DATE') === '') {
                return -1;
            }

            if ($second->attribute('DATE') !== '' && $first->attribute('DATE') === '') {
                return 1;
            }

            return 0;
        }

        return TagComparator::byOrder($first_tag, $second_tag);
    }

    public static function typeOrder(Fact $fact): int
    {
        $tag = self::effectiveTag($fact);

        return TagComparator::order($tag);
    }

    private static function effectiveTag(Fact $fact): string
    {
        [, $tag] = explode(':', $fact->tag(), 2);

        if ($tag === 'NO') {
            return $fact->value();
        }

        if ($fact->id() === 'asso') {
            return 'EVEN';
        }

        return $tag;
    }
}
```

## Phase 1 — Characterization

### Part A: `bin/characterize_date_compare.php`

No DB bootstrap needed; Date constructor only calls `Registry::calendarDateFactory()` (dependency-free registry lookup). Needs `I18N::init()` + `TimestampFactory` stub + `CalendarDateFactory` registration (latter two for Date constructor's potential need for "now"). See the actual script for full stub machinery.

**Cases** (exercises every branch, including the asymmetric `$bmax > 0` guard):
- `'12 JAN 1900'` vs `'15 JAN 1900'` → a strictly before b → -1
- `'15 JAN 1900'` vs `'12 JAN 1900'` → reverse → 1
- `'12 JAN 1900'` vs `'12 JAN 1900'` → identical → 0
- `'1900'` (year-only, wide JD range) vs `'12 JAN 1900'` (exact day inside it) → 0 (overlap)
- `'BEF 12 JAN 1900'` vs `'12 JAN 1900'` → BEF nudges a to minJD-1 → -1
- `'AFT 12 JAN 1900'` vs `'12 JAN 1900'` → AFT nudges a to maxJD+1 → 1
- `'BEF 12 JAN 1900'` vs `'AFT 12 JAN 1900'` → both nudged → -1
- `''` (empty/invalid, JD=0) vs `'12 JAN 1900'` → exercises `$bmax > 0` guard on a-side → -1
- `'12 JAN 1900'` vs `''` → b empty (JD=0) → guard only on a-side, no match → 0
- `''` vs `''` → both empty → 0

Output: `golden/date_compare.json` with 10 cases, each including `input`, `a_details`, `b_details`, and `output`.

### Part B: `tests/Unit/Comparators/FactComparatorCharacterizationTest.php`

PHPUnit test extending `TestCase` with `protected static bool $uses_database = true;`. Uses `self::createStub(Individual::class)` with stubbed `tag()` returning `'INDI'` (only way to construct real `Fact` objects; `Fact` constructor requires a concrete `GedcomRecord $parent`, which requires a DB-backed `Tree`).

**Cases** (varied GEDCOM fact snippets to exercise each code path):
- Two dated facts, different dates and types (`"1 BIRT\n2 DATE 12 JAN 1900"` vs `"1 DEAT\n2 DATE 15 JAN 1900"`) → byDate should sort by date.
- Two facts, same date, different types (both dated `12 JAN 1900`, BIRT vs DEAT) → byDate returns 0, byType tie-breaks by type order.
- One dated, one undated (BIRT with DATE vs DEAT without) → byDate returns 0 (not both OK).
- Same tag, one dated and one undated → byType's dated-before-undated tie-break.
- Two unrecognized tags (`"1 FAKE1"` vs `"1 FAKE2"`) → effectiveTag fallback to EVEN.
- NO negation fact (`"1 NO BIRT"`) → effectiveTag returns value (the negated tag), not the NO tag itself. Verifies `tag()` → `'INDI:NO'`, `value()` → `'BIRT'`.
- ASSO associate fact (id='asso') → effectiveTag returns `'EVEN'` regardless of actual tag.

Output: `golden/fact_comparator.json` with 7 cases, each including:
- `label`, `fact1`, `fact2` (each with `tag`, `value`, `id_method`, `attributeDate`, `date` sub-object, `typeOrder`)
- `comparisons` (`byDate`, `byType`)

**Execution:** `vendor/bin/phpunit --filter FactComparatorCharacterizationTest` writes the JSON as a side effect.

### Parity tests

`js-tests/parity_date_compare.test.js` (10 tests) and `js-tests/parity_fact_comparator.test.js` (28 tests = 7 cases × 4 assertions each: byDate, byType, typeOrder on both facts). Both iterate the golden JSON and match PHP output exactly.

## Phase 2 — Port (JavaScript)

### Part A: `lib/date-compare.js`

Export `compareDates(a, b)` taking plain objects:
```js
{
  qual1: string,
  minimumJulianDay: number,
  maximumJulianDay: number
}
```

Apply BEF/AFT nudges to min/max JD values; then compare ranges exactly as PHP.

### Part B: `lib/comparators/fact-comparator.js`

Export:
- `byDate(first, second)` — check `minimumJulianDay !== 0 && maximumJulianDay !== 0` for isOK; call `compareDates()` if both OK, with `byType()` tie-break; else return 0.
- `byType(first, second)` — compute `effectiveTag()` on both; if equal, compare `attributeDate !== ''` presence; else delegate to `tagByOrder()`.
- `typeOrder(fact)` — compute `effectiveTag()` then call `tagOrder()`.
- Private helper `effectiveTag(fact)` — split `fact.tag` on `':'`, take the part after colon; if exactly `'NO'`, return `fact.value`; if `fact.id === 'asso'`, return `'EVEN'`; else return the tag part.

Import `compareDates` from `../date-compare.js` and `{ order, byOrder }` from `./tag-comparator.js`.

## Corrections found during implementation

None. PHP behavior matched all expectations:
- Empty dates (JD=0) return 0 or -1 depending on whether the other side is non-empty (asymmetric guard `&& $bmax > 0`).
- NO facts correctly use `value()` (the negated tag) as their effective tag.
- ASSO facts with id='asso' correctly fall through to EVEN.
- Dated facts always sort before undated facts of the same type (byType tie-break).

## Definition of done

- [x] `bin/characterize_date_compare.php` generates `golden/date_compare.json` (10 cases).
- [x] `lib/date-compare.js` exports `compareDates()`.
- [x] `js-tests/parity_date_compare.test.js` passes 100% (10/10).
- [x] `tests/Unit/Comparators/FactComparatorCharacterizationTest.php` (PHPUnit) generates `golden/fact_comparator.json` (7 cases × 4 assertions = 28 total).
- [x] `lib/comparators/fact-comparator.js` exports `byDate()`, `byType()`, `typeOrder()`, and private `effectiveTag()` helper.
- [x] `js-tests/parity_fact_comparator.test.js` passes 100% (28/28).
- [x] Combined parity: `npm test` passes 52/52 (14 from task 3's TagComparator + 10 from Part A + 28 from Part B).
- [x] Updated `docs/php-to-js-migration/phase4-cutover-tracking.md` row for `lib/comparators`: added Part A and Part B to "Functions migrated", bumped test count to 52, updated notes to reflect task 12 complete and acknowledged FactComparator's real high-traffic call sites (out of scope for bridging in this task).
- [x] **Not bridged to live PHP call sites** — matching task 3's deliberate separation of port (done now) from Phase 3 bridging (out of scope). FactComparator's callers are non-deprecated and high-traffic; bridging would follow the same `server/migration-service.mjs` + PHP short-circuit pattern as TagComparator, but that decision is separate.

## Phase 3 bridging: deliberately not done here

See task-03's notes. FactComparator differs from TagComparator only in that its real callers (`app/GedcomRecord.php:577-578`, `app/Services/FactSortService.php`, `app/Services/GedcomEditService.php`, `app/Module/TimelineChartModule.php`) are high-traffic and non-deprecated — bridging would have real business value. But the decision to bridge is orthogonal to porting; if/when that decision is made, repeat the exact pattern from phase3-soundex-bridge.md / phase3-surname-tradition-bridge.md: add a `/comparators/fact/compare` or similar route to `server/migration-service.mjs`, stub `FactComparator::byDate()` / `::byType()` with a short-circuit check to the service, with fallback to native PHP if the service is unreachable or undefined.
