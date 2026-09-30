import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DATA } from '../src/data.js';

const root = new URL('..', import.meta.url);

test('music: every track file exists and every track is credited in music-credits.txt', () => {
  const credits = readFileSync(new URL('assets/licenses/music-credits.txt', root), 'utf8');
  assert.equal(DATA.music.length, 6);
  for (const t of DATA.music) {
    assert.ok(existsSync(new URL(t.file, root)), `${t.file} is missing`);
    assert.ok(credits.includes(`${t.id}.mp3`) && credits.includes(`"${t.title}"`), `${t.title} is not in music-credits.txt`);
    for (const k of ['title', 'author', 'site', 'siteUrl', 'license', 'licenseUrl', 'plays']) assert.ok(t[k], `${t.id} has no ${k}`);
  }
});
