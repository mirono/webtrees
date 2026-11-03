# Phase 5 step 32: FanChartModule

`/tree/{tree}/fan-chart-{style}-{generations}-{width}/{xref}` — served
entirely by Node. The SIXTH chart route, and the first whose real PHP
output isn't HTML: `FanChartModule::chart()` (`app/Module/FanChartModule.php:228-441`)
draws pie-slice wedges and rotated TTF text into a GD image with
`imagefilledarc()`/`imagettftext()`, PNG-encodes it, and embeds it as a
base64 `<img usemap="...">` with an HTML `<map><area>` per ancestor for
the click-to-open popup menu.

## Rendering decision: inline SVG, not a GD-identical PNG

Reproducing GD's bitmap drawing in Node would need a native canvas/
font-rendering dependency (e.g. `@napi-rs/canvas`) just for this one
chart, plus reimplementing GD's own font-metric-based text-cropping
loop (`fitTextToPixelWidth()`/`textWidthInPixels()`). Checked with the
user before implementing: the port draws the same wedge geometry
instead as inline SVG —

- `<path>` annular sectors (donut segments) for the wedges, using the
  EXACT SAME angle/radius formulas as PHP's generation loop (see
  below) — same layout/proportions/colors, just not a pixel-identical
  bitmap.
- `<text>` with `textLength`/`lengthAdjust="spacingAndGlyphs"` to fit
  each line within its wedge — replacing GD's manual crop-and-pad loop
  with the SVG-native equivalent (no font-metrics code needed at all).
- The same click-to-open `.fan_chart_menu` popup behavior as before,
  now triggered from `<a href="#xref">` wrapping each wedge `<path>`
  instead of an `<area>` inside `<img usemap>`.

No new native dependency, crisp rendering at any zoom (the `width`
query param no longer needs to regenerate a bitmap at a new
resolution — same SVG, browser scales it), and it reuses the existing
"replace innerHTML with the loaded HTML, execute any `<script>`
sequentially" ajax-load mechanism (`resources/js/webtrees.js:86-123`)
unchanged — the inline `<script>` at the end of the ajax body still
works exactly as it did for the original `<area>`-based version.

## Porting GD's angle math to SVG wedges

`FanChartModule::chart()`'s generation loop (`app/Module/FanChartModule.php:281-427`)
draws, for each generation from `generations` down to `1`, a full
disk at that generation's diameter — each smaller disk painted on top
of the previous (larger) one's center, so the NET visual result is an
annular ring per generation. `buildFanWedges()`
(`pages-server/fan-chart-view.mjs`) makes that explicit: for each
generation it computes `innerR`/`outerR` from the SAME
`arc_diameter = width * generation / generations` formula, and draws
one annular wedge per present Sosa number using the identical
start/end-angle formulas:

```
sosa_start = 2^generation - 1
sosa_end   = 2^(generation - 1)
start_angle = chart_start_angle + floor(chart_angle * (sosa - sosa_end) / sosa_end)
end_angle   = chart_start_angle + floor(chart_angle * (sosa - sosa_end + 1) / sosa_end)
```

GD and SVG agree on which direction angles sweep (both use a y-down
pixel/user space, angle 0 = east, increasing clockwise on screen) —
confirmed live: `sosa=3`'s wedge (the FIRST one drawn per generation,
since the loop counts sosa DOWN from `sosa_start`) starts its outer
arc at `(cx, cy-r)` (due north) for a full-circle chart, matching
`chart_start_angle=90` + a half-turn offset exactly as hand-computed.

One real sign flip: GD's `imagettftext()` angle is documented as
"higher values rotate counter-clockwise" **as seen on screen** (GD's
own convention, not a y-up/y-down coordinate distinction), while SVG's
`transform="rotate()"` is clockwise-positive on screen. So
`textPlacement()` negates PHP's own `text_angle` (`rotateDeg: -textAngle`)
to reproduce the same on-screen tangent orientation.

## `imagefilledarc()`'s 360° pie has no SVG equivalent via start/end arc

A center wedge covering the WHOLE chart angle (full-circle style,
`generations`'s innermost ring, Sosa 1) is a full 360° GD pie — SVG
can't express that as a single `A` (arc) command (zero-length arc at
the seam). `describeAnnularWedge()` clamps to `359.99°` in that case —
visually indistinguishable, confirmed live (`I1`'s own wedge: a Sosa-1
360° disk rendered as `M 400 400 L 400 498 A 98 98 0 1 1 400.02 498 Z`,
not a degenerate point).

## Scope cut: the popup menu's cross-chart and family links

Real PHP's per-ancestor popup (`ModuleThemeTrait::individualBoxMenu()`)
has three parts: the name link, a link to every OTHER enabled chart
module for this individual (`individualBoxMenuCharts()` — enumerating
every `ModuleChartInterface` module, calling its own `chartBoxMenu()`),
and this individual's own "Family with spouse" / spouse / children
links (`individualBoxMenuFamilyLinks()`). This port keeps only the name
link (`renderPopupMenu()` in `pages-server/fan-chart-view.mjs`) — the
other two are a deliberate v1 cut: clicking through to the ancestor's
own individual page already surfaces their families, and building a
real cross-module-link enumerator isn't needed by anything ported so
far. Worth adding later if it turns out to matter in practice.

## Reused infrastructure

`buildSosaStradonitzAncestors()` (`pages-server/index.mjs`) generalizes
what was `buildCompactTreeAncestors()` to take `generations` as a
parameter instead of CompactTree's own hardcoded `5` — both chart
handlers now call the same breadth-first-walk function.
`buildChartBoxViewModel()` is reused unchanged for every ancestor's
`fullNameHtml`/`alternateNameHtml`/`lifespanText`/`sex`/`url` (stripped
of HTML tags for the SVG `<text>` content, matching PHP's own
`strip_tags()`/plain-string handling in the GD text/image-map code).

## Live verification

Against the real "ophir" tree, starting from `I1`:

- Full page load (200) at all three styles — ajax body `viewBox`
  height exactly matches PHP's own per-style formula at `width=800px`
  (100%): half circle → `800×400`, three-quarter circle → `800×688`,
  full circle → `800×800`.
- Ajax body: one `<a class="wt-chart-fan-wedge">`-wrapped `<path>` per
  present ancestor, correct `M/F/U` fill colors, one `.fan_chart_menu`
  popup per ancestor, the click-handler `<script>` present verbatim.
- `400` for an out-of-range `style`/`generations`/`width`, `404` for a
  nonexistent individual, `302` for a nonexistent tree, `405` for an
  unsupported method, `302` POST→GET redirect (clamping any
  out-of-range posted value back to its own default, same as PHP's
  `Validator` would reject/the request handler would otherwise 400 on).
- No errors in `pages` container logs across all of the above.

5157 tests passing (up from 5142), zero regressions.

Not independently re-verified: pixel-level visual fidelity of the SVG
wedges/text (no headless-browser screenshot tooling available in this
environment) — verified instead by hand-deriving the angle/radius math
for several Sosa numbers and confirming the rendered path coordinates
match exactly, plus the formula-level GD-vs-SVG rotation-sign reasoning
above.

## Next candidates

Remaining chart modules (Lifespans, Timeline, Relationships,
Statistics, PedigreeMap) are each a different shape again (Lifespans/
Timeline are SVG timelines, Relationships is a graph search over
relationship paths, Statistics renders arbitrary chart types from a
block-configuration system, PedigreeMap plots markers on a map tile
provider) — each needs its own scoping pass before porting.
