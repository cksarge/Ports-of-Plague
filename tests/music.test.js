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
    assert.ok(existsSync(new URL(t.mobileFile, root)), `${t.mobileFile} is missing (run npm run music)`);
    assert.ok(credits.includes(`${t.id}.mp3`) && credits.includes(`"${t.title}"`), `${t.title} is not in music-credits.txt`);
    for (const k of ['file', 'mobileFile', 'title', 'author', 'site', 'siteUrl', 'license', 'licenseUrl', 'plays']) assert.ok(t[k], `${t.id} has no ${k}`);
  }
});

test('music: phones and tablets get the small files, computers the full ones', async () => {
  const { wantsSmallMusic } = await import('../src/ui/music.js');
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  assert.equal(wantsSmallMusic({ userAgent: iphone }), true);
  assert.equal(wantsSmallMusic({ userAgent: android }), true);
  assert.equal(wantsSmallMusic({ userAgent: mac, maxTouchPoints: 5 }), true, 'an iPad reports itself as a Mac');
  assert.equal(wantsSmallMusic({ userAgent: mac, maxTouchPoints: 0 }), false);
  assert.equal(wantsSmallMusic({ userAgent: windows }), false);
  assert.equal(wantsSmallMusic({ userAgent: windows, connection: { saveData: true } }), true);
  assert.equal(wantsSmallMusic({ userAgent: windows, userAgentData: { mobile: true } }), true);
});
