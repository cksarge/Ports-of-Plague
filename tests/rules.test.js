import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DATA } from '../src/data.js';
import { renderRulebook } from '../src/render/rulebook.js';

const factRef = (id) => `<sup class="fact-ref">${id}</sup>`;

test('rule book renders every section', () => {
  const html = renderRulebook(DATA.rulebook, DATA.config, { factRef });
  for (const sec of DATA.rulebook.sections) assert.ok(html.includes(`id="rules-${sec.id}"`), sec.title);
  assert.ok(!html.includes('{{'), 'no unfilled placeholders');
});

test('printed Rule Book contains exactly the rules text the game shows', { skip: !existsSync(new URL('../docs/Ports-of-Plague-Rule-Book.html', import.meta.url)) && 'run npm run docs first' }, () => {
  const printed = readFileSync(new URL('../docs/Ports-of-Plague-Rule-Book.html', import.meta.url), 'utf8');
  const rules = renderRulebook(DATA.rulebook, DATA.config, { factRef, level: 2 });
  assert.ok(printed.includes(rules), 'docs are out of date: run npm run docs');
});

test('every card text is free of unfilled placeholders and names at least one fact', () => {
  for (const c of [...DATA.chronicle, ...DATA.deck]) {
    assert.ok(!c.text.includes('{{'), c.title);
    assert.ok(c.factIds.length > 0, c.title);
  }
});
