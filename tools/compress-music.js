// Makes the small versions of the music for phones and tablets:
// assets/music/<id>.mp3 (full quality, kept as is) → assets/music/mobile/<id>.m4a
// (AAC, 96 kbps: about a third of the size, plays in every current browser).
// Uses afconvert, which comes with macOS.   npm run music
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA } from '../src/data.js';

const root = new URL('..', import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
mkdirSync(path('assets/music/mobile/'), { recursive: true });
const mb = (p) => (statSync(path(p)).size / 1048576).toFixed(1);
for (const t of DATA.music) {
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', '-q', '127', path(t.file), path(t.mobileFile)]);
  console.log(`${t.id}: ${mb(t.file)} MB → ${mb(t.mobileFile)} MB`);
}
