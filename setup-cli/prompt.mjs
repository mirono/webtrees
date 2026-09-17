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

// Minimal interactive-prompt helpers for setup-cli/'s step-by-step
// wizard - no dependency needed for the small, flat set of prompts it
// asks.
//
// Two genuinely different code paths, not one shared one:
//
// - A real terminal (process.stdin.isTTY): a single shared
//   node:readline interface, asked one question at a time as the user
//   types - readline handles this correctly for a live TTY.
// - Piped/non-TTY stdin (scripted answers, CI): readline does NOT work
//   for this - reproduced directly. When a whole piped input arrives as
//   one chunk, readline synchronously emits a 'line' event for EVERY
//   complete line in that chunk back-to-back, in one tight loop, before
//   any `await`-deferred continuation gets a chance to run. Since each
//   `question()` call registers a ONE-SHOT 'line' listener, only the
//   very first question - the one already registered before any input
//   arrived - ever gets an answer; by the time an `await`'d continuation
//   calls the next `question()`, the 'line' events for every other
//   piped line already fired into the void and are gone, so the second
//   question hangs forever (confirmed: plain nested callbacks, with no
//   `await` between calls, don't have this problem - only the
//   microtask-deferred continuation does). The fix here is to sidestep
//   readline entirely for this case: read all of stdin synchronously
//   up front and serve answers from that pre-split queue - which is the
//   only sensible behavior for piped input anyway, since there's no
//   real back-and-forth to have.

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

const isInteractive = process.stdin.isTTY === true;

let sharedInterface = null;
let pipedLines = null;
let pipedLineIndex = 0;

function getInterface() {
  sharedInterface ??= createInterface({ input: process.stdin, output: process.stdout });

  return sharedInterface;
}

function getPipedLines() {
  if (pipedLines === null) {
    let raw = '';

    try {
      raw = readFileSync(0, 'utf8');
    } catch {
      // Nothing piped in (e.g. /dev/null, or a genuinely empty pipe) -
      // treat as no answers available; every prompt below falls back to
      // its default (or an empty string).
      raw = '';
    }

    pipedLines = raw.split('\n');
  }

  return pipedLines;
}

function nextPipedLine() {
  const lines = getPipedLines();
  const line = pipedLineIndex < lines.length ? lines[pipedLineIndex] : '';

  pipedLineIndex += 1;

  return line;
}

export function closePrompt() {
  sharedInterface?.close();
  sharedInterface = null;
}

export function promptText(question, defaultValue, { silent = false } = {}) {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const label = `${question}${suffix}: `;

  if (!isInteractive) {
    process.stdout.write(label);

    const answer = nextPipedLine().trim();

    // Never echo the real value for a silent (password) prompt, even
    // though this is already a scripted/piped context.
    process.stdout.write(silent ? '(hidden)\n' : `${answer}\n`);

    return Promise.resolve(answer === '' ? (defaultValue ?? '') : answer);
  }

  return new Promise((resolve) => {
    getInterface().question(label, (answer) => {
      resolve(answer.trim() === '' ? (defaultValue ?? '') : answer.trim());
    });
  });
}

// Control-character code points relevant to raw-mode keystroke handling
// below (compared via charCodeAt rather than embedding literal control
// bytes in the source, which is easy to corrupt by accident): ETX
// (Ctrl+C, 3), EOT (Ctrl+D, 4), DEL (backspace on most terminals, 127).
const CODE_ETX = 3;
const CODE_EOT = 4;
const CODE_DEL = 127;
const CODE_BACKSPACE = 8;

/**
 * A masked password prompt: echoes "*" per keystroke instead of the raw
 * character. Requires stdin to be a TTY (raw mode) - falls back to
 * promptText (unmasked, reading from the pre-split queue) when it
 * isn't, e.g. when piped in CI, so the CLI still works there rather
 * than hanging.
 */
export async function promptPassword(question) {
  if (!isInteractive) {
    return promptText(question, undefined, { silent: true });
  }

  return new Promise((resolve) => {
    process.stdout.write(`${question}: `);

    const stdin = process.stdin;
    let value = '';

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (char) => {
      const code = char.charCodeAt(0);

      if (char === '\n' || char === '\r' || code === CODE_EOT) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
        return;
      }

      if (code === CODE_ETX) {
        process.stdout.write('\n');
        process.exit(130);
      }

      if (code === CODE_DEL || code === CODE_BACKSPACE) {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      value += char;
      process.stdout.write('*');
    };

    stdin.on('data', onData);
  });
}
