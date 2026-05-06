/**
 * ESLint rule: flag bare Korean string literals in source.
 *
 * Why:
 *   - Phase 2 of the i18n roadmap targets zero hardcoded Hangul outside the
 *     `locales/` JSON. The presence of any Korean character in a `Literal`
 *     or `JSXText` node is a regression marker.
 *
 * Allowlist:
 *   - Locale resource files (`/locales/`)
 *   - i18n machinery (`/i18n/`)
 *   - Test fixtures (`*.test.*`, `*.fixture.*`)
 *   - Comments are not visited by this rule (only `Literal` / `JSXText`).
 *
 * To opt out a single line, add `// eslint-disable-next-line
 * no-hardcoded-korean -- <reason>` above it. Use sparingly and explain why.
 */

const HANGUL = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const ALLOW_PATH = /\/(locales|i18n)\/|\.(test|spec|fixture)\./;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded Korean string literals; use t() instead.',
    },
    schema: [],
    messages: {
      hardcoded:
        'Hardcoded Korean text "{{snippet}}" — wrap in t() and add to locales/ko/<ns>.json.',
    },
  },
  create(context) {
    // ESLint v9+ flat config uses context.filename; v8 uses context.getFilename()
    const rawFilename = typeof context.filename === 'string'
      ? context.filename
      : (typeof context.getFilename === 'function' ? context.getFilename() : '');
    const filename = rawFilename.replace(/\\/g, '/');
    if (ALLOW_PATH.test(filename)) {
      return {};
    }
    function check(node, value) {
      if (typeof value !== 'string') return;
      if (!HANGUL.test(value)) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      const snippet = trimmed.length > 30 ? trimmed.slice(0, 27) + '...' : trimmed;
      context.report({ node, messageId: 'hardcoded', data: { snippet } });
    }
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value && node.value.cooked);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};
