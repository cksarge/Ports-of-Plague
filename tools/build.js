// Builds the finished game as ONE self-contained file (code, data, map,
// fonts and styles inlined) that runs by double-clicking, fully offline.
// It is written twice: Ports-of-Plague.html (to double-click) and
// index.html (the front page for GitHub Pages). dev.html is the source page.
//   npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// The MIT licenses of the bundled libraries (the Supabase realtime client used
// for multi-device play) travel with the code, at the top of the script.
const notices = ['MIT-supabase-realtime-js.txt', 'MIT-supabase-phoenix.txt']
  .map((f) => read(`assets/licenses/${f}`).trim()).join('\n\n---\n\n').replace(/\*\//g, '* /');
const result = await build({
  entryPoints: [fileURLToPath(new URL('src/ui/main.js', root))],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  // Old enough for iPhones and iPads on iOS 15 (the first Safari with <dialog>).
  target: ['es2020', 'safari15', 'chrome90', 'firefox98'],
  legalComments: 'none',
  banner: { js: `/*! Ports of Plague includes these open-source libraries:\n\n${notices}\n*/` },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// Inline fonts in the stylesheet as data URIs.
let css = read('src/styles/game.css').replace(/url\(['"]?\.\.\/\.\.\/assets\/fonts\/([^'")]+)['"]?\)/g, (m, file) => {
  const b64 = readFileSync(new URL(`assets/fonts/${file}`, root)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});

// Replacement functions, not strings: in a replacement string, "$'" or "$&"
// inside the minified code would be read as special patterns and break it.
const html = read('dev.html')
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/\s*<script type="importmap">.*<\/script>/, '')
  .replace(/<script type="module" src="[^"]*"><\/script>/, () => `<script>\n${js}\n</script>`);
writeFileSync(new URL('Ports-of-Plague.html', root), html);
writeFileSync(new URL('index.html', root), html);
console.log(`Built Ports-of-Plague.html and index.html (${(html.length / 1024).toFixed(0)} KB each). Double-click either to play.`);
