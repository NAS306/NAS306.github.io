import { build } from 'vite';
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
await import('./prepare-assets.js');
await build();
async function files(dir) { const entries = await readdir(dir, { withFileTypes: true }); return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`))).flat(); }
for (const path of await files('dist')) if (/_BU\.[^/]+$/.test(path)) await unlink(path);
const assets = (await files('dist')).filter(p => !p.endsWith('sw.js')).map(p => './' + p.slice(5));
const template = await readFile('src/serviceWorker.js', 'utf8');
await writeFile('dist/sw.js', template.replace('__ASSETS__', JSON.stringify(assets)).replace('__VERSION__', String(Date.now())));
