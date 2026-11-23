// Ícone neutro do app para quem faz o cadastro (o do Thiago é o avatar dele). Haltere no fundo roxo do app.
// uso: node icons/app-gerar.mjs  (precisa do pacote @resvg/resvg-js; gera icons/app-*.png)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.RESVG_DIR ? process.env.RESVG_DIR + '/' : import.meta.url);
const { Resvg } = require('@resvg/resvg-js');
const dir = new URL('.', import.meta.url);
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><radialGradient id="b" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#4a3a8a"/><stop offset=".65" stop-color="#1c1438"/><stop offset="1" stop-color="#07060d"/></radialGradient>
<radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#a98bff" stop-opacity=".5"/><stop offset="1" stop-color="#a98bff" stop-opacity="0"/></radialGradient>
<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9b8ff"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#b)"/><circle cx="256" cy="256" r="210" fill="url(#g)"/>
<g transform="translate(256 256) scale(${pad}) rotate(-30)" fill="url(#m)">
<rect x="-120" y="-14" width="240" height="28" rx="10"/>
<rect x="-150" y="-78" width="38" height="156" rx="14"/><rect x="-196" y="-56" width="36" height="112" rx="12"/>
<rect x="112" y="-78" width="38" height="156" rx="14"/><rect x="160" y="-56" width="36" height="112" rx="12"/>
</g></svg>`;
const out = (name, size, pad) => writeFileSync(new URL(name, dir), new Resvg(svg(pad), { fitTo:{ mode:'width', value:size } }).render().asPng());
out('app-192.png', 192, 1); out('app-512.png', 512, 1); out('app-maskable-512.png', 512, .72); out('app-apple-touch.png', 180, .9);
console.log('ok');
