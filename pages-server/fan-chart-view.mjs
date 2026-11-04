/**
 * webtrees: online genealogy
 * Copyright (C) 2026 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// View layer for /tree/{tree}/fan-chart-{style}-{generations}-{width}/{xref}
// (FanChartModule, phase 5 step 32) - the SIXTH chart route, and the
// first whose real PHP output (app/Module/FanChartModule.php:chart())
// is not HTML at all: it draws pie-slice wedges and rotated TTF text
// into a GD image, PNG-encodes it, and embeds it as a base64 <img>
// with an HTML <map> for the per-ancestor click areas.
//
// Reproducing GD's bitmap drawing (imagefilledarc, imagettftext, its
// own font-metric-based text cropping) in Node would need a native
// canvas/font-rendering dependency just for this one chart. Instead
// this port draws the same wedge geometry/colors/text as inline SVG:
// <path> annular sectors for the wedges (same angle formulas as PHP,
// so the same layout/proportions), <text> with textLength/
// lengthAdjust="spacingAndGlyphs" to fit each line within its wedge
// (replacing GD's manual font-metric cropping loop), and the same
// click-to-open popup menu behavvior as before - just triggered from
// <a href="#xref"> wrapping each wedge <path> instead of an <area> in
// an <img usemap>. Not a pixel-identical bitmap, but the same visual
// chart, with no new native dependency and crisp rendering at any
// zoom. (Confirmed with the user before implementing - see chat.)

const BACKGROUND_COLORS = {
  M: '#b1cff0',
  F: '#e9daf1',
  U: '#eeeeee',
};

const GAP_BETWEEN_RINGS = 2;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function point(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The path `d` attribute for an annular wedge (donut segment) - the
 * SVG analogue of two nested `imagefilledarc()` calls (outer disk
 * minus the next ring's disk painted over its center).
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} innerR
 * @param {number} outerR
 * @param {number} startDeg
 * @param {number} endDeg
 * @returns {string}
 */
export function describeAnnularWedge(cx, cy, innerR, outerR, startDeg, endDeg) {
  let sweepEnd = endDeg;

  // SVG can't describe a 0-length arc for a full circle/annulus - clamp
  // just short of 360 degrees, same visual result.
  if (sweepEnd - startDeg >= 360) {
    sweepEnd = startDeg + 359.99;
  }

  const largeArc = sweepEnd - startDeg > 180 ? 1 : 0;

  const [outerStartX, outerStartY] = point(cx, cy, outerR, startDeg);
  const [outerEndX, outerEndY] = point(cx, cy, outerR, sweepEnd);

  if (innerR <= 0) {
    return [
      `M ${fmt(cx)} ${fmt(cy)}`,
      `L ${fmt(outerStartX)} ${fmt(outerStartY)}`,
      `A ${fmt(outerR)} ${fmt(outerR)} 0 ${largeArc} 1 ${fmt(outerEndX)} ${fmt(outerEndY)}`,
      'Z',
    ].join(' ');
  }

  const [innerEndX, innerEndY] = point(cx, cy, innerR, sweepEnd);
  const [innerStartX, innerStartY] = point(cx, cy, innerR, startDeg);

  return [
    `M ${fmt(outerStartX)} ${fmt(outerStartY)}`,
    `A ${fmt(outerR)} ${fmt(outerR)} 0 ${largeArc} 1 ${fmt(outerEndX)} ${fmt(outerEndY)}`,
    `L ${fmt(innerEndX)} ${fmt(innerEndY)}`,
    `A ${fmt(innerR)} ${fmt(innerR)} 0 ${largeArc} 0 ${fmt(innerStartX)} ${fmt(innerStartY)}`,
    'Z',
  ].join(' ');
}

/**
 * Mirrors FanChartModule::chart()'s own per-wedge text placement:
 * text drawn at a tangent to the arc, at `text_radius`, running from
 * `startAngle+delta` to `endAngle-delta` (`delta` growing as the
 * wedge narrows so text never touches the wedge's edges), rotated so
 * it reads "upright" along the tangent.
 *
 * @param {{startAngle: number, endAngle: number, generation: number, arcDiameterPx: number, arcWidthPx: number}} wedge
 * @returns {{x: number, y: number, rotateDeg: number, maxLengthPx: number}}
 */
function textPlacement({ startAngle, endAngle, generation, arcDiameterPx, arcWidthPx }, cx, cy) {
  const angle = endAngle - startAngle;
  const textAngle = 270 - (startAngle + endAngle) / 2;
  const textRadius = arcDiameterPx / 2 - arcWidthPx * 0.25;

  let delta;

  if (angle >= 360) {
    delta = 90;
  } else if (angle === 180) {
    delta = generation === 1 ? 20 : 60;
  } else if (angle > 120) {
    delta = 45;
  } else if (angle > 60) {
    delta = 15;
  } else {
    delta = 1;
  }

  const [txStart, tyStartRaw] = point(cx, cy, textRadius, startAngle + delta);
  const [txEnd, tyEnd] = point(cx, cy, textRadius, endAngle - delta);

  let tyStart = tyStartRaw;

  if (generation === 1) {
    tyStart -= textRadius / 2;
  }

  const maxLengthPx = Math.sqrt((txEnd - txStart) ** 2 + (tyEnd - tyStart) ** 2);

  return { x: txStart, y: tyStart, rotateDeg: -textAngle, maxLengthPx };
}

/**
 * Builds the full set of ring/wedge draw instructions for one fan
 * chart, mirroring FanChartModule::chart()'s own generation loop
 * (app/Module/FanChartModule.php:281-427) - same angle/radius
 * formulas, translated from nested `imagefilledarc()` disks into
 * explicit annular wedges.
 *
 * @param {Map<number, {box: object}>} ancestors keyed by Sosa number - `box` is a buildChartBoxViewModel() result (fullNameHtml/alternateNameHtml/lifespanText/sex/url/xref)
 * @param {number} generations
 * @param {number} widthPx
 * @param {number} chartStartAngle
 * @param {number} chartEndAngle
 * @returns {{widthPx: number, heightPx: number, backgroundWedges: Array<object>, personWedges: Array<object>}}
 */
export function buildFanWedges(ancestors, generations, widthPx, chartStartAngle, chartEndAngle, heightPx) {
  const cx = Math.trunc(widthPx / 2);
  const cy = cx;
  const arcWidthPx = widthPx / generations / 2.0;
  const chartAngle = chartEndAngle - chartStartAngle;

  const backgroundWedges = [];
  const personWedges = [];

  for (let generation = generations; generation >= 1; generation--) {
    const sosaStart = 2 ** generation - 1;
    const sosaEnd = 2 ** (generation - 1);

    const arcDiameterPx = Math.trunc((widthPx * generation) / generations);
    const outerR = arcDiameterPx / 2;
    const innerDiameterPx = generation > 1 ? Math.trunc((widthPx * (generation - 1)) / generations) : 0;
    const innerR = innerDiameterPx / 2;

    backgroundWedges.push({
      d: describeAnnularWedge(cx, cy, innerR, outerR, chartStartAngle, chartEndAngle),
      fill: BACKGROUND_COLORS.U,
    });

    const personOuterR = outerR - GAP_BETWEEN_RINGS;

    for (let sosa = sosaStart; sosa >= sosaEnd; sosa--) {
      const ancestor = ancestors.get(sosa);

      if (ancestor === undefined) {
        continue;
      }

      const startAngle = chartStartAngle + Math.trunc((chartAngle * (sosa - sosaEnd)) / sosaEnd);
      const endAngle = chartStartAngle + Math.trunc((chartAngle * (sosa - sosaEnd + 1)) / sosaEnd);

      const placement = textPlacement(
        { startAngle, endAngle, generation, arcDiameterPx: arcDiameterPx - 2 * GAP_BETWEEN_RINGS, arcWidthPx },
        cx,
        cy,
      );

      const plainFullName = ancestor.box.fullNameHtml.replace(/<[^>]*>/g, '');
      const plainAlternateName = ancestor.box.alternateNameHtml.replace(/<[^>]*>/g, '');
      const textLines = [plainFullName, plainAlternateName, ancestor.box.lifespanText].filter(
        (line) => line !== '' && line !== null && line !== undefined,
      );

      personWedges.push({
        sosa,
        xref: ancestor.box.xref,
        d: describeAnnularWedge(cx, cy, innerR, personOuterR, startAngle, endAngle),
        fill: BACKGROUND_COLORS[ancestor.box.sex] ?? BACKGROUND_COLORS.U,
        text: { ...placement, lines: textLines },
        box: ancestor.box,
      });
    }
  }

  return { widthPx, heightPx, backgroundWedges, personWedges };
}

function renderWedgeText(text) {
  if (text.lines.length === 0) {
    return '';
  }

  const [firstLine, ...restLines] = text.lines;
  const tspans = restLines
    .map((line) => `<tspan x="${fmt(text.x)}" dy="1.1em">${escapeHtml(line)}</tspan>`)
    .join('');

  return (
    `<text class="wt-chart-fan-wedge-text" x="${fmt(text.x)}" y="${fmt(text.y)}" ` +
    `textLength="${fmt(text.maxLengthPx)}" lengthAdjust="spacingAndGlyphs" ` +
    `transform="rotate(${fmt(text.rotateDeg)} ${fmt(text.x)} ${fmt(text.y)})">` +
    `${escapeHtml(firstLine)}${tspans}</text>`
  );
}

/**
 * Mirrors the first line of ModuleThemeTrait::individualBoxMenu()'s
 * real popup content - the name link itself. Real PHP's own version
 * also lists every OTHER enabled chart module's link for this
 * individual (individualBoxMenuCharts()) and this individual's
 * "Family with spouse" / spouse / children links
 * (individualBoxMenuFamilyLinks()); both are intentionally not
 * reproduced here as a v1 scope cut (clicking through to the
 * ancestor's own individual page already surfaces their families) -
 * see docs/php-to-js-migration/phase5-fan-chart.md.
 *
 * @param {{box: object}} ancestor
 * @returns {string}
 */
function renderPopupMenu(ancestor) {
  const { box } = ancestor;

  return (
    `<div id="${escapeAttr(box.xref)}" class="fan_chart_menu">` +
    `<a href="${escapeAttr(box.url)}" class="dropdown-item p-1">${box.fullNameHtml}</a>` +
    '</div>'
  );
}

/**
 * Renders the ajax body for the fan chart: an inline SVG (wedges +
 * text) followed by one hidden popup-menu `<div>` per ancestor, and
 * the click-handler script that opens/positions them - replacing real
 * PHP's `<img usemap>` + `<map><area>` + identical script
 * (resources/views/modules/fanchart/chart.phtml).
 *
 * @param {{widthPx: number, heightPx: number, backgroundWedges: Array<object>, personWedges: Array<object>}} wedges see buildFanWedges()
 * @param {Array<{box: object, familyLinks: Array<object>}>} popupAncestors
 * @param {string} title
 * @returns {string}
 */
export function renderFanChart(wedges, popupAncestors, title) {
  const { widthPx, heightPx, backgroundWedges, personWedges } = wedges;

  const backgroundPaths = backgroundWedges
    .map((wedge) => `<path d="${wedge.d}" fill="${wedge.fill}"></path>`)
    .join('');

  const personGroups = personWedges
    .map((wedge) => {
      const path = `<path d="${wedge.d}" fill="${wedge.fill}" stroke="#ffffff" stroke-width="0.5"></path>`;
      const text = renderWedgeText(wedge.text);

      return `<a href="#${escapeAttr(wedge.xref)}" class="wt-chart-fan-wedge">${path}${text}</a>`;
    })
    .join('');

  const popups = popupAncestors.map((ancestor) => renderPopupMenu(ancestor)).join('');

  return (
    `<svg class="wt-chart-fan-img" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}" ` +
    `role="img" aria-label="${escapeAttr(title)}">${backgroundPaths}${personGroups}</svg>` +
    `${popups}` +
    `<script>
  document.querySelectorAll('a.wt-chart-fan-wedge').forEach(function (area) {
    area.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      const display = target.style.display;

      target.parentElement.querySelectorAll('.fan_chart_menu')
        .forEach(function (element) {
          element.style.display = 'none';
        });

      if (display !== 'block') {
        target.style.display = 'block';
        target.style.left = Math.max(0, e.pageX - (target.offsetWidth / 2)) + 'px';
        target.style.top = Math.max(0, e.pageY - 1 - target.offsetHeight) + 'px';
      }
    });
  });
</script>`
  );
}

/**
 * Full page: /tree/{tree}/fan-chart-{style}-{generations}-{width}/{xref}.
 * Mirrors resources/views/modules/fanchart/page.phtml - the chart
 * options form (individual, layout/style, generations, zoom/width)
 * plus an ajax-loaded content div, same full-page-document shape as
 * every other chart page (see compact-tree-chart-view.mjs's own
 * renderCompactTreeChartPage()).
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {{xref: string}} params.individual
 * @param {number} params.style
 * @param {Record<number,string>} params.styles
 * @param {number} params.generations
 * @param {number} params.minGenerations
 * @param {number} params.maxGenerations
 * @param {number} params.width
 * @param {number} params.minWidth
 * @param {number} params.maxWidth
 * @param {string} params.ajaxUrl
 * @returns {string}
 */
export function renderFanChartPage({
  tree,
  user,
  csrfToken,
  title,
  individual,
  style,
  styles,
  generations,
  minGenerations,
  maxGenerations,
  width,
  minWidth,
  maxWidth,
  ajaxUrl,
  genealogyMenuHtml = '',
}) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">`
      : '';

  const userMenuHtml =
    user !== null
      ? `
                    <li class="nav-item">
                        <span class="nav-link">${escapeHtml(user.realName)}</span>
                    </li>
                    <li class="nav-item menu-logout">
                        <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
                    </li>`
      : `
                    <li class="nav-item">
                        <a class="nav-link" href="/login">Sign in</a>
                    </li>`;

  const styleOptions = Object.entries(styles)
    .map(
      ([value, label]) =>
        `<option value="${escapeAttr(value)}" ${Number(value) === style ? 'selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('');

  const generationOptions = [];

  for (let g = minGenerations; g <= maxGenerations; g++) {
    generationOptions.push(`<option value="${g}" ${g === generations ? 'selected' : ''}>${g}</option>`);
  }

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-fan-chart-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
                ${genealogyMenuHtml}
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    <h2 class="wt-page-title">${title}</h2>

                    <form method="post" class="wt-page-options wt-page-options-fan-chart d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="xref">Individual</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="xref" id="xref" value="${escapeHtml(individual.xref)}" required>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="style">Layout</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <select class="form-select" name="style" id="style">${styleOptions}</select>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="generations">Generations</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <select class="form-select" name="generations" id="generations">${generationOptions.join('')}</select>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="width">Zoom</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <div class="input-group">
                                    <input class="form-control" id="width" max="${maxWidth}" min="${minWidth}" name="width" required="required" type="number" value="${width}">
                                    <span class="input-group-text">%</span>
                                </div>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-form-label col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="btn btn-primary" type="submit" value="view">
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    <div class="wt-page-content wt-chart wt-chart-fan" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
                </div>
            </div>
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
