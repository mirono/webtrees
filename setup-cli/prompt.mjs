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

// Minimal interactive-prompt helpers on Node's built-in readline/promises
// - no dependency needed for the small, flat set of prompts setup-cli/
// needs.

import { createInterface } from 'node:readline/promises';

export async function promptText(question, defaultValue) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` (${defaultValue})` : '';

  try {
    const answer = await rl.question(`${question}${suffix}: `);

    return answer.trim() === '' ? (defaultValue ?? '') : answer.trim();
  } finally {
    rl.close();
  }
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
 * character. Requires stdin to be a TTY (raw mode) - falls back to a
 * plain (unmasked) prompt when it isn't, e.g. when piped in CI, so the
 * CLI still works there rather than hanging.
 */
export async function promptPassword(question) {
  if (!process.stdin.isTTY) {
    return promptText(question);
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
