#!/usr/bin/env node
/**
 * Backfill empty plural-form keys in locale JSONs using the un-suffixed
 * parent key as the source.
 *
 * Why this exists:
 *   i18next-parser auto-generates `_one`/`_other` (and other CLDR plural
 *   forms) when it sees `{{count}}` interpolation, writing empty strings.
 *   For Korean — which has no morphological plural — the un-suffixed key is
 *   already the canonical translation, so the empty `_other` placeholders
 *   are noise. For English, the un-suffixed key is also typically the
 *   plural form, so duplicating it gives a workable default that
 *   translators can later refine.
 *
 *   Without this script the `locale-parity` test fails on every extract
 *   because empty translation strings are treated as missing.
 *
 * Scope:
 *   Operates on `ko` and `en` only — these are the locales that ship in
 *   ENABLED_LOCALES. Other locales remain empty for translator review.
 *
 * Usage:
 *   `node scripts/i18n-fill-plurals.cjs`
 *   Run after `npm run i18n:extract` (or wire it as a post-extract hook).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];
const NAMESPACES = ['app', 'common', 'editor', 'errors', 'player'];
const FILL_LOCALES = ['ko', 'en'];
const LOCALES_DIR = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'locales');

function fillPlurals(node) {
  if (typeof node !== 'object' || node === null) return 0;
  let filled = 0;
  for (const key of Object.keys(node)) {
    if (typeof node[key] === 'object') {
      filled += fillPlurals(node[key]);
    }
  }
  for (const key of Object.keys(node)) {
    if (typeof node[key] !== 'string' || node[key] !== '') continue;
    const suffix = PLURAL_SUFFIXES.find((s) => key.endsWith(s));
    if (!suffix) continue;
    const baseKey = key.slice(0, -suffix.length);
    const baseValue = node[baseKey];
    if (typeof baseValue === 'string' && baseValue !== '') {
      node[key] = baseValue;
      filled += 1;
    }
  }
  return filled;
}

function run() {
  let total = 0;
  for (const locale of FILL_LOCALES) {
    for (const ns of NAMESPACES) {
      const filePath = path.join(LOCALES_DIR, locale, `${ns}.json`);
      if (!fs.existsSync(filePath)) continue;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const filled = fillPlurals(data);
      if (filled > 0) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
        total += filled;
        process.stdout.write(`  [filled ${filled}] ${locale}/${ns}.json\n`);
      }
    }
  }
  process.stdout.write(`Done. ${total} plural placeholder(s) filled.\n`);
}

run();
