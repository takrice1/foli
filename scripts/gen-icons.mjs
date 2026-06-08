// Generates public/icon-192.png and public/icon-512.png from public/icon-src.svg
// Run once: node scripts/gen-icons.mjs

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svg = readFileSync(resolve(root, 'public/icon-src.svg'), 'utf-8');

for (const size of [192, 512]) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  writeFileSync(resolve(root, `public/icon-${size}.png`), png);
  console.log(`✓  icon-${size}.png  (${png.length} bytes)`);
}

// Maskable icon (full-bleed, no rounded corners — OS clips to shape)
const maskSvg = readFileSync(resolve(root, 'public/icon-maskable-src.svg'), 'utf-8');
for (const size of [192, 512]) {
  const resvg = new Resvg(maskSvg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  writeFileSync(resolve(root, `public/icon-maskable-${size}.png`), png);
  console.log(`✓  icon-maskable-${size}.png  (${png.length} bytes)`);
}

// Apple touch icon (180×180, same as standard icon)
const resvgApple = new Resvg(svg, { fitTo: { mode: 'width', value: 180 } });
const applePng = resvgApple.render().asPng();
writeFileSync(resolve(root, 'public/apple-touch-icon.png'), applePng);
console.log(`✓  apple-touch-icon.png  (${applePng.length} bytes)`);

console.log('Done.');
