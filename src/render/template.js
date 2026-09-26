// Fills {{config.path}} and {{fact:ID}} placeholders in rule text.
// Shared by the in-game Rules screen and the printable Rule Book.

export function lookup(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Returns every placeholder in a string, for the audit and tests.
export function placeholders(text) {
  return [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
}

export function fillTemplate(text, config, { factRef = (id) => `[${id}]` } = {}) {
  return text.replace(/\{\{([^}]+)\}\}/g, (whole, raw) => {
    const key = raw.trim();
    if (key.startsWith('fact:')) return factRef(key.slice(5));
    const value = lookup(config, key);
    if (value === undefined || typeof value === 'object') {
      throw new Error(`Rule text placeholder {{${key}}} has no value in config.json`);
    }
    return String(value);
  });
}

// Minimal inline markup: **bold** and *italic*. Input must already be HTML-escaped.
export function inlineMarkup(html) {
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
