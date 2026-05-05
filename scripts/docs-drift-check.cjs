#!/usr/bin/env node
/**
 * docs-drift-check
 *
 * For each translated document under `docs/{en,ko,...}/` and `README.*.md`
 * we read a `last_synced: <commit-sha>` value from frontmatter and check
 * whether the source-language counterpart has changed since that commit.
 *
 * Source of truth: English. A document is considered drifted if the English
 * file has commits newer than the translation's `last_synced`.
 *
 * Usage:
 *   node scripts/docs-drift-check.cjs            # exit 0 when in sync
 *   node scripts/docs-drift-check.cjs --strict   # exit non-zero on drift (CI mode)
 *
 * Skips:
 *   - Files without a frontmatter `last_synced` (treated as untracked).
 *   - Files in `.planning/**` (internal Korean-only).
 *
 * Phase 4 follow-up: extend to detect README.<locale>.md drift.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const STRICT = process.argv.includes('--strict');

function listFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function readFrontmatter(content) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const block = content.slice(4, end);
  const out = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([\w_-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function gitChangesSince(file, sinceSha) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--oneline', `${sinceSha}..HEAD`, '--', file],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    return out.trim().split('\n').filter(Boolean).length;
  } catch {
    // git not available or sha unknown: treat as not-drifted (skip).
    return 0;
  }
}

function findEnglishCounterpart(filePath) {
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  // README.<locale>.md → README.md
  const readmeMatch = rel.match(/^(.*)README\.(?!md$)([a-z]{2})\.md$/);
  if (readmeMatch) return path.join(REPO_ROOT, readmeMatch[1] + 'README.md');
  // docs/<locale>/<file> → docs/en/<file>
  const docsMatch = rel.match(/^docs\/([a-z]{2})\/(.+)$/);
  if (docsMatch && docsMatch[1] !== 'en') return path.join(REPO_ROOT, 'docs/en', docsMatch[2]);
  return null;
}

const drifted = [];
const skipped = [];
const docsRoot = path.join(REPO_ROOT, 'docs');
const candidates = [
  ...listFiles(docsRoot).filter((p) => !/[\\\/]en[\\\/]/.test(p) && /[\\\/]([a-z]{2})[\\\/]/.test(p)),
  ...fs
    .readdirSync(REPO_ROOT)
    .filter((f) => /^README\.[a-z]{2}\.md$/.test(f))
    .map((f) => path.join(REPO_ROOT, f)),
];

for (const file of candidates) {
  const content = fs.readFileSync(file, 'utf8');
  const fm = readFrontmatter(content);
  if (!fm || !fm.last_synced) {
    skipped.push(path.relative(REPO_ROOT, file));
    continue;
  }
  const source = findEnglishCounterpart(file);
  if (!source || !fs.existsSync(source)) continue;
  const sourceRel = path.relative(REPO_ROOT, source);
  const changes = gitChangesSince(sourceRel, fm.last_synced);
  if (changes > 0) {
    drifted.push({ file: path.relative(REPO_ROOT, file), source: sourceRel, changes });
  }
}

if (skipped.length > 0) {
  console.log('[docs-drift] no last_synced frontmatter (untracked):');
  for (const s of skipped) console.log('  -', s);
}

if (drifted.length === 0) {
  console.log('[docs-drift] OK — all tracked translations are in sync.');
  process.exit(0);
}

console.log('\n[docs-drift] drift detected:');
for (const d of drifted) {
  console.log(`  - ${d.file}  (source ${d.source} has ${d.changes} new commits)`);
}
process.exit(STRICT ? 1 : 0);
