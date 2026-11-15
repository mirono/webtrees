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

// HTML widget renderers for the "add/edit a fact" form (phase 5 step
// 47, editing "Phase A" foundation). Ports AbstractElement::edit() and
// its ~12 behavioural overrides (app/Elements/*.php - NoteStructure,
// DateValue[Exact]/DateLdsOrd, PlaceName/PlaceLivingOrdinance,
// PlaceLatitude/PlaceLongtitude, SexValue, AbstractXrefElement's 11
// concrete subclasses, AbstractEventElement, SubmitterText,
// EmptyElement), dispatching on the `widget` code
// bin/characterize_gedcom_elements.php assigned each tag path, plus
// the structural recursive renderer from
// resources/views/edit/edit-gedcom-fields.phtml that walks a multi-
// line GEDCOM block and emits one labelled row per line with
// collapsible nesting.
//
// Known fidelity gaps, all deliberate and all deferred to whichever
// Phase B/C route actually wires a page using these widgets:
//   - The calendar-popup icon (DateValue) and the "Latitude /
//     Longitude" collapse-toggle icon (PlaceLatitude/Longtitude)
//     render the same markup/hooks as real PHP but the client-side JS
//     behind them (`webtrees.calendarWidget`, `webtrees.reformatDate`,
//     `webtrees.reformatLatitude/Longitude`) hasn't been ported - the
//     fields degrade to plain text inputs until that JS exists.
//   - DateValue's "form-text" live GEDCOM-date preview (`new
//     Date($value))->display()`) is omitted - needs the date-parsing
//     infra wholesale, not worth it for a preview-only line.
//   - PlaceName's live autocomplete needs AutoCompletePlace
//     (app/Http/RequestHandlers/AutoCompletePlace.php) ported as a
//     route - the `data-wt-autocomplete-url` attribute is emitted
//     pointing at it regardless, so the field works as plain text
//     entry today and gains autocomplete for free once that route
//     lands.
//   - Xref pickers (11 AbstractXrefElement subclasses) use a plain
//     `<select>` of every record of that type, matching this
//     migration's established record-merge.mjs precedent, not real
//     PHP's TomSelect AJAX-search widget. The "create a new X" inline
//     modal buttons (XrefMedia/XrefSource/XrefRepository/XrefNote's
//     create-shortcut) are cut entirely - out of scope until those
//     modals exist.
//   - NoteStructure's inline/shared toggle (new, empty note) uses a
//     plain inline `onchange` handler (same self-contained-`<script>`
//     pattern AbstractEventElement's own checkbox toggle already
//     uses in real PHP) instead of a dedicated JS module.

import { elementFor, canonicalValue } from './gedcom-edit-service.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, '');
}

/** Mirrors AbstractXrefElement's edit() dispatch (type -> picker). */
const XREF_TYPE_LABELS = {
  INDI: 'an individual',
  FAM: 'a family',
  OBJE: 'a media object',
  NOTE: 'a shared note',
  REPO: 'a repository',
  SOUR: 'a source',
  SUBM: 'a submitter',
  SUBN: 'a submission',
  LOC: 'a location',
};

/**
 * Mirrors AbstractElement::edit()'s generic (no-override) branch: a
 * `<select>` of controlled values if the element has any, else a
 * plain text `<input>`.
 */
function renderGenericControl(id, name, tag, value, element) {
  const values = element.values ?? {};

  if (Object.keys(values).length > 0) {
    const canonical = canonicalValue(tag, value);
    const options = { ...values };
    if (!(canonical in options)) options[canonical] = canonical;

    const optionsHtml = Object.entries(options)
      .map(
        ([key, label]) =>
          `<option value="${escapeHtml(key)}"${key === canonical ? ' selected="selected"' : ''}>${
            stripTags(label) === '' ? '&nbsp;' : escapeHtml(stripTags(label))
          }</option>`,
      )
      .join('');

    return `<select class="form-select" name="${escapeHtml(name)}" id="${escapeHtml(id)}">${optionsHtml}</select>`;
  }

  const maxlength = element.maxLength ? ` maxlength="${element.maxLength}"` : '';
  const pattern = element.pattern ? ` pattern="${escapeHtml(element.pattern)}"` : '';

  return `<input class="form-control" dir="auto" type="text" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"${maxlength}${pattern} />`;
}

/** Mirrors AbstractEventElement::edit() - the "Y/empty" checkbox. */
function renderBooleanYControl(id, name, value) {
  const checked = value !== '';
  return (
    `<div class="form-check">` +
    `<input class="form-control" type="hidden" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${checked ? 'Y' : ''}" />` +
    `<input class="form-check-input" type="checkbox" value="Y" id="${escapeHtml(id)}-check" ${checked ? 'checked="checked"' : ''} />` +
    `<label class="form-check-label" for="${escapeHtml(id)}-check">This event occurred, but the details are unknown.</label>` +
    `</div>` +
    `<script>document.getElementById(${JSON.stringify(`${id}-check`)}).addEventListener('change', function () { document.getElementById(${JSON.stringify(id)}).value = this.checked ? 'Y' : ''; });</script>`
  );
}

/** Mirrors DateValue/DateValueExact/DateLdsOrd::edit(). See file-level doc comment for the JS gaps. */
function renderDateControl(id, name, value, element) {
  const maxlength = element.maxLength ? ` maxlength="${element.maxLength}"` : '';
  const pattern = element.pattern ? ` pattern="${escapeHtml(element.pattern)}"` : '';

  return (
    `<div class="input-group">` +
    `<input class="form-control" dir="ltr" type="text" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" onchange="webtrees.reformatDate && webtrees.reformatDate(this)"${maxlength}${pattern} />` +
    `<span class="input-group-text"><a href="#" onclick="return window.webtrees && webtrees.calendarWidget && webtrees.calendarWidget('caldiv${escapeHtml(id)}', '${escapeHtml(id)}');" title="Select a date">\u{1F4C5}</a></span>` +
    `</div>` +
    `<div id="caldiv${escapeHtml(id)}" style="position:absolute;visibility:hidden;background-color:white;z-index:1000"></div>`
  );
}

/** Mirrors PlaceName/PlaceLivingOrdinance::edit(). */
function renderPlaceControl(id, name, value, treeName) {
  const autocompleteUrl = `/tree/${encodeURIComponent(treeName)}/autocomplete/place`;
  return `<input data-wt-autocomplete-url="${escapeHtml(autocompleteUrl)}" autocomplete="off" class="form-control" type="text" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
}

/** Mirrors PlaceLatitude/PlaceLongtitude::edit(). */
function renderCoordinateControl(id, name, value, axis) {
  const handler = axis === 'latitude' ? 'reformatLatitude' : 'reformatLongitude';
  return `<input class="form-control" type="text" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" onchange="webtrees.${handler} && webtrees.${handler}(this)" />`;
}

/** Mirrors SexValue::edit(). */
function renderSexRadioControl(name, value, element) {
  const selected = canonicalValue('INDI:SEX', value);
  return Object.entries(element.values ?? {})
    .map(([key, label]) => {
      const checked = key === selected ? ' checked="checked"' : '';
      const radioId = `${name}-${key}`;
      return (
        `<div class="form-check form-check-inline">` +
        `<input class="form-check-input" type="radio" name="${escapeHtml(name)}" id="${escapeHtml(radioId)}" value="${escapeHtml(key)}"${checked} />` +
        `<label class="form-check-label" for="${escapeHtml(radioId)}">${escapeHtml(label)}</label>` +
        `</div>`
      );
    })
    .join('');
}

/** Mirrors SubmitterText::edit() (editTextArea()). */
function renderTextareaControl(id, name, value) {
  return `<textarea class="form-control" id="${escapeHtml(id)}" name="${escapeHtml(name)}" rows="3" dir="auto">${escapeHtml(value)}</textarea>`;
}

/** Mirrors EmptyElement::edit(). */
function renderEmptyControl(id, name, value) {
  return `<input class="form-control" type="hidden" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
}

/**
 * Mirrors the 11 concrete AbstractXrefElement::edit() overrides,
 * simplified to a plain `<select>` picker (see file-level doc
 * comment). `records` is the pre-fetched `[{xref, label}]` list for
 * this xref type - callers already have `listRecordsByType()`
 * (record-merge.mjs) for exactly this shape.
 *
 * @param {string} id
 * @param {string} name
 * @param {string} value Current value, e.g. '@X123@' or ''
 * @param {string} xrefType 'INDI'|'FAM'|'OBJE'|'NOTE'|'REPO'|'SOUR'|'SUBM'|'SUBN'|'LOC'
 * @param {Array<{xref: string, label: string}>} records
 */
function renderXrefControl(id, name, value, xrefType, records) {
  const selected = value.replaceAll('@', '');
  const optionsHtml = [`<option value="">&nbsp;</option>`]
    .concat(
      (records ?? []).map(
        (r) =>
          `<option value="@${escapeHtml(r.xref)}@"${r.xref === selected ? ' selected="selected"' : ''}>${escapeHtml(r.label)} — ${escapeHtml(r.xref)}</option>`,
      ),
    )
    .join('');

  return `<select class="form-select" aria-label="${escapeHtml(XREF_TYPE_LABELS[xrefType] ?? xrefType)}" id="${escapeHtml(id)}" name="${escapeHtml(name)}">${optionsHtml}</select>`;
}

/**
 * Mirrors NoteStructure::edit(): an existing shared-note xref, an
 * existing inline note (textarea), or (new/empty) a radio choice
 * between the two, matching real PHP's inline/shared toggle with a
 * self-contained `<script>` instead of a dedicated JS module.
 *
 * @param {Array<{xref: string, label: string}>} noteRecords Pre-fetched shared notes, for the xref branch.
 */
function renderNoteControl(id, name, value, noteRecords) {
  if (/^@[A-Za-z0-9_]+@$/.test(value)) {
    return renderXrefControl(id, name, value, 'NOTE', noteRecords);
  }

  if (value !== '') {
    return renderTextareaControl(id, name, value);
  }

  const inlineId = `${id}-inline`;
  const sharedId = `${id}-shared`;

  return (
    `<div id="${escapeHtml(id)}-note-structure">` +
    `<div class="form-check form-check-inline">` +
    `<input class="form-check-input" type="radio" name="${escapeHtml(id)}-options" id="${escapeHtml(id)}-option-inline" value="inline" checked="checked" />` +
    `<label class="form-check-label" for="${escapeHtml(id)}-option-inline">inline note</label>` +
    `</div>` +
    `<div class="form-check form-check-inline">` +
    `<input class="form-check-input" type="radio" name="${escapeHtml(id)}-options" id="${escapeHtml(id)}-option-shared" value="shared" />` +
    `<label class="form-check-label" for="${escapeHtml(id)}-option-shared">shared note</label>` +
    `</div>` +
    `<div id="${escapeHtml(inlineId)}">${renderTextareaControl(id, name, '')}</div>` +
    `<div id="${escapeHtml(sharedId)}" style="display:none">${renderXrefControl(`${id}-shared-select`, name, '', 'NOTE', noteRecords)}</div>` +
    `<script>` +
    `(function(){var r=document.getElementsByName(${JSON.stringify(`${id}-options`)});var i=document.getElementById(${JSON.stringify(inlineId)});var s=document.getElementById(${JSON.stringify(sharedId)});` +
    `function sync(){var shared=document.getElementById(${JSON.stringify(`${id}-option-shared`)}).checked;i.style.display=shared?'none':'';s.style.display=shared?'':'none';}` +
    `for(var k=0;k<r.length;k++){r[k].addEventListener('change',sync);}})();` +
    `</script>` +
    `</div>`
  );
}

/**
 * Renders the single edit control for one GEDCOM line - mirrors
 * `Registry::elementFactory()->make($tag)->edit($id, $name, $value, $tree)`.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.name
 * @param {string} params.value
 * @param {string} params.tag Full colon-delimited tag path, e.g. 'INDI:BIRT:DATE'
 * @param {string} params.treeName
 * @param {Record<string, Array<{xref: string, label: string}>>} [params.xrefOptions] Pre-fetched record lists, keyed by xref type.
 */
export function renderEditControl({ id, name, value, tag, treeName, xrefOptions = {} }) {
  const element = elementFor(tag);

  switch (element.widget) {
    case 'boolean-y':
      return renderBooleanYControl(id, name, value);
    case 'date':
      return renderDateControl(id, name, value, element);
    case 'place':
      return renderPlaceControl(id, name, value, treeName);
    case 'coordinate':
      return renderCoordinateControl(id, name, value, tag.endsWith('LATI') ? 'latitude' : 'longitude');
    case 'sex-radio':
      return renderSexRadioControl(name, value, element);
    case 'textarea':
      return renderTextareaControl(id, name, value);
    case 'note':
      return renderNoteControl(id, name, value, xrefOptions.NOTE);
    case 'empty':
      return renderEmptyControl(id, name, value);
    default:
      if (element.widget.startsWith('xref:')) {
        const xrefType = element.widget.slice('xref:'.length);
        return renderXrefControl(id, name, value, xrefType, xrefOptions[xrefType]);
      }
      return renderGenericControl(id, name, tag, value, element);
  }
}

/**
 * Mirrors resources/views/edit/edit-gedcom-fields.phtml: walks a
 * multi-line GEDCOM block and renders one labelled row per line
 * (level/tag as hidden inputs + the line's own value as an edit
 * control), nesting a line's subtag rows inside a
 * `wt-nested-edit-fields` wrapper, collapsed by default when the
 * parent element says `collapseChildren()` and none of the subtags
 * currently have a value (same as real PHP's `$collapse[$key]` logic).
 *
 * @param {object} params
 * @param {string} params.gedcom Multi-line GEDCOM, levels relative to `hierarchy`'s own depth.
 * @param {Array<string>} params.hierarchy Tag-path prefix, e.g. ['INDI', 'BIRT'] for a fact's own lines starting "1 BIRT".
 * @param {string} params.treeName
 * @param {string} [params.prefix] Form field name prefix, e.g. '' or 'facts[0][' - matches real PHP's `$prefix`.
 * @param {string} [params.idPrefix] Unique id prefix (real PHP's `Registry::idFactory()->id()`).
 * @param {Record<string, Array<{xref: string, label: string}>>} [params.xrefOptions]
 */
export function renderEditGedcomFields({ gedcom, hierarchy, treeName, prefix = '', idPrefix = 'wt', xrefOptions = {} }) {
  const lineRe = /^(\d+) (\w+) ?(.*)$/gm;
  const levels = [];
  const tags = [];
  const values = [];

  for (const match of gedcom.matchAll(lineRe)) {
    levels.push(Number(match[1]));
    tags.push(match[2]);
    values.push(match[3] ?? '');
  }

  const count = levels.length;
  const fullHierarchy = [...hierarchy];
  const fullTags = [];
  const ids = [];
  const indent = [];
  const collapse = [];

  for (let key = 0; key < count; key += 1) {
    fullHierarchy[levels[key]] = tags[key];
    const fullTag = fullHierarchy.slice(0, 1 + levels[key]).join(':');
    fullTags[key] = fullTag;
    ids[key] = `${idPrefix}-${fullTag.replaceAll(':', '-')}-${key}`;

    const hasSubtags = (levels[key + 1] ?? 0) > levels[key];

    let hasSubtagsWithValues = false;
    for (let n = key + 1; n < count && levels[n] > levels[key]; n += 1) {
      if (values[n] !== '') {
        hasSubtagsWithValues = true;
        break;
      }
    }

    indent[key] = (elementFor(fullTag).collapseChildren ?? false) && hasSubtags;
    collapse[key] = key > 0 && indent[key] && !hasSubtagsWithValues;
  }

  let html = '';

  for (let key = 0; key < count; key += 1) {
    if (indent[key - 1]) {
      html += collapse[key - 1]
        ? `<div id="collapse-${escapeHtml(ids[key])}" class="collapse wt-nested-edit-fields">`
        : `<div class="wt-nested-edit-fields">`;
    }

    const element = elementFor(fullTags[key]);
    const levelField = `<input type="hidden" name="${escapeHtml(prefix)}levels[]" value="${levels[key]}">`;
    const tagField = `<input type="hidden" name="${escapeHtml(prefix)}tags[]" value="${escapeHtml(tags[key])}">`;

    if (element.widget === 'empty' && values[key] === '') {
      html += levelField + tagField + `<input type="hidden" name="${escapeHtml(prefix)}values[]" value="">`;
    } else {
      const expandButton = collapse[key]
        ? `<button class="btn btn-link" data-bs-target="#collapse-${escapeHtml(ids[key + 1])}" data-bs-toggle="collapse" aria-expanded="false" aria-controls="collapse-${escapeHtml(ids[key + 1])}" type="button">▼</button>`
        : '';

      const control = renderEditControl({
        id: ids[key],
        name: `${prefix}values[]`,
        value: values[key].replaceAll('\r', '\n'),
        tag: fullTags[key],
        treeName,
        xrefOptions,
      });

      html +=
        `<div class="row mb-3">` +
        `<label class="col-sm-3 col-form-label" for="${escapeHtml(ids[key])}">${escapeHtml(element.label)}${expandButton}</label>` +
        `<div class="col-sm">${levelField}${tagField}${control}</div>` +
        `</div>`;
    }

    for (let n = key; levels[n] >= (levels[key + 1] ?? levels[0]); n -= 1) {
      if (indent[n]) {
        indent[n] = false;
        html += `</div>`;
      }
      if (levels[n] === (levels[key + 1] ?? levels[0])) break;
    }
  }

  return html;
}
