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

// Port of app/Report/TextWrapper.php (task 20).
//
// Word-wraps text to fit within a given width using measured font metrics.
// This is the single source of truth for text line-breaking across both
// the HTML and PDF backends in PHP; only the HTML measurer
// (HtmlTextMeasurer) is ported — PdfTextMeasurer delegates to TCPDF's live
// font-metrics engine and stays PHP-side.
//
// Works on real Unicode text (codepoint indexing via Array.from, matching
// PHP's mb_strlen()/mb_substr()).

const URL_BREAK_CHARACTERS = ['/', '-', '.', '?', '&', '=', '#', ':'];

function mbLength(text) {
  return Array.from(text).length;
}

function mbSubstr(text, start, length) {
  const chars = Array.from(text);

  if (length === undefined) {
    return chars.slice(start).join('');
  }

  return chars.slice(start, start + length).join('');
}

export class TextWrapper {
  constructor(measurer) {
    this.measurer = measurer;
  }

  /**
   * Split text into physical lines that fit within the given width.
   *
   * Respects explicit line breaks (\n) and wraps at word boundaries.
   *
   * When subsequentWidth is provided, the first physical line wraps at
   * width and all following lines wrap at subsequentWidth. This supports
   * inline continuation where the first line has less available space
   * than subsequent lines (e.g., text following a footnote reference).
   *
   * @returns {Array<string>}
   */
  wrapText(text, style, firstWidth, subsequentWidth = null) {
    if (firstWidth <= 0.0) {
      throw new Error('Width must be greater than zero: ' + firstWidth);
    }

    const nextLineWidth = subsequentWidth ?? firstWidth;
    const logicalLines = text.split('\n');
    const result = [];
    const spaceWidth = this.measurer.getStringWidth(' ', style);
    let effectiveWidth = firstWidth;

    for (const line of logicalLines) {
      const words = line.split(' ');
      let currentLine = '';
      let currentWidth = 0.0;

      // Preserve leading space: split produces an empty first token when
      // the line starts with a space. Prefix the space onto the first
      // real word so it appears in the rendered output (e.g. the gap
      // after footnote references).
      if (words[0] === '') {
        words.shift();
        if (words.length !== 0) {
          words[0] = ' ' + words[0];
        }
      }

      for (let word of words) {
        // We need to add a space between words, but there might not be room.
        if (currentLine !== '') {
          if (currentWidth + spaceWidth >= effectiveWidth) {
            result.push(currentLine);
            effectiveWidth = nextLineWidth;
            currentLine = '';
            currentWidth = 0.0;
          } else {
            currentLine += ' ';
            currentWidth += spaceWidth;
          }
        }

        let wordWidth = this.measurer.getStringWidth(word, style);

        if (currentWidth + wordWidth <= effectiveWidth) {
          // The word fits on the current line.
          currentLine += word;
          currentWidth += wordWidth;
        } else if (wordWidth <= nextLineWidth) {
          // The word fits on a subsequent line — push current and start fresh.
          result.push(currentLine);
          effectiveWidth = nextLineWidth;
          currentLine = word;
          currentWidth = wordWidth;
        } else {
          // The word is too long even for a subsequent line. Break it.
          // Firstly, a short part to fill the current line.
          let fragment = this.breakLongWord(word, effectiveWidth - currentWidth, style);
          result.push(currentLine + fragment);
          effectiveWidth = nextLineWidth;
          word = mbSubstr(word, mbLength(fragment));
          wordWidth = this.measurer.getStringWidth(word, style);

          // Secondly, chunks of the word that fill a full subsequent line.
          while (wordWidth > effectiveWidth) {
            fragment = this.breakLongWord(word, effectiveWidth, style);
            result.push(fragment);
            word = mbSubstr(word, mbLength(fragment));
            wordWidth = this.measurer.getStringWidth(word, style);
          }

          // Thirdly, the remaining part, less than a full line.
          currentLine = word;
          currentWidth = wordWidth;
        }
      }

      result.push(currentLine);
      effectiveWidth = nextLineWidth;
    }

    return result;
  }

  /**
   * Return the portion of a long word that fits within the given width.
   */
  breakLongWord(word, width, style) {
    if (this.measurer.getStringWidth(word, style) <= width) {
      return word;
    }

    const length = mbLength(word);
    let fitCount = 0;
    let bestBreak = 0;

    // Walk character by character to find how many fit within the width
    for (let index = 1; index <= length; index++) {
      if (this.measurer.getStringWidth(mbSubstr(word, 0, index), style) > width) {
        break;
      }

      fitCount = index;

      if (URL_BREAK_CHARACTERS.includes(mbSubstr(word, index - 1, 1))) {
        bestBreak = index;
      }
    }

    // Prefer breaking at URL punctuation; otherwise break at the last fitting character.
    // Math.max(1, ...) ensures forward progress even when nothing fits.
    const breakAt = bestBreak > 0 ? bestBreak : Math.max(1, fitCount);

    return mbSubstr(word, 0, breakAt);
  }

  /**
   * Count the number of physical lines text will occupy at the given width.
   */
  countLines(text, width, style) {
    return this.wrapText(text, style, width).length;
  }

  /**
   * Calculate the total height of wrapped text.
   *
   * @param {number} [lineHeightRatio] Multiplier applied to font size for line spacing
   */
  textHeight(text, width, style, lineHeightRatio = 1.25) {
    const lineCount = this.countLines(text, width, style);

    return lineCount * style.size * lineHeightRatio;
  }

  /**
   * Return the width of the last physical line after wrapping.
   */
  lastLineWidth(text, width, style) {
    const lines = this.wrapText(text, style, width);
    const lastLine = lines[lines.length - 1];

    return this.measurer.getStringWidth(lastLine, style);
  }
}
