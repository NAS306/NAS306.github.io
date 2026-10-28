import { build as bundle } from 'esbuild';
import { readFile, writeFile, mkdir, rename, copyFile, access } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderModeCards } from './src/js/80-mode-cards.js';

const root = dirname(fileURLToPath(import.meta.url));
export const JS_MODULES = [
  '00-math', '01-runtime', '02-mobile-support',
  '10-weapon-config', '11-level-config', '12-game-flow', '14-game-pause',
  '20-rogue-ammo', '21-rogue-dice', '22-rogue-stats', '23-progression', '24-i18n',
  '30-entities', '31-systems', '40-rogue-balance', '41-rogue-abilities',
  '42-rogue-state', '43-rogue-effects', '44-rogue-transition', '45-rogue-projectiles', '50-rogue-world',
  '51-rogue-history', '75-localized-game-text', '76-localized-guide', '77-rogue-guide', '78-rogue-ability-ui', '79-rogue-charts', '80-mode-cards', '81-rogue-game', '82-progression-ui', '83-language-ui', '90-game', '95-fps', '99-api',
].map(name => `src/js/${name}.js`);
export const CSS_FILES = ['src/styles/main.css', 'src/styles/rogue.css', 'src/styles/rogue-guide.css', 'src/styles/language.css', 'src/styles/mode-select.css'];
const assetCache = new Map();
async function assetUrl(name) {
  if (assetCache.has(name)) return assetCache.get(name);
  const path = resolve(root, 'src/assets', name);
  if (relative(resolve(root, 'src/assets'), path).startsWith('..')) throw new Error(`Invalid asset path: ${name}`);
  const mime = name.endsWith('.mp3') ? 'audio/mpeg' : name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.png') ? 'image/png' : null;
  if (!mime) throw new Error(`Unsupported asset type: ${name}`);
  const value = `data:${mime};base64,${(await readFile(path)).toString('base64')}`;
  assetCache.set(name, value);
  return value;
}
async function inlineAssets(text) {
  const matches = [...text.matchAll(/(["'])\.\/assets\/([^"']+)\1/g)];
  for (const match of matches) text = text.replaceAll(match[0], `${match[1]}${await assetUrl(match[2])}${match[1]}`);
  return text;
}
function insert(template, marker, text) {
  if (template.split(marker).length !== 2) throw new Error(`Expected one ${marker} marker`);
  return template.replace(marker, () => text);
}
export async function build() {
  const result = await bundle({
    stdin: {
      contents: JS_MODULES.map(path => `import './${path}';`).join('\n') + '\nexport * from "./src/js/99-api.js";',
      resolveDir: root, sourcefile: 'ordered-entry.js',
    },
    absWorkingDir: root, tsconfigRaw: {},
    bundle: true, format: 'iife', globalName: 'TankGame', target: 'es2022',
    write: false, legalComments: 'none', charset: 'utf8',
    plugins: [{ name: 'inline-game-assets', setup(builder) {
      builder.onResolve({ filter: /^\./ }, args => {
        const path = resolve(args.resolveDir || root, args.path);
        if (relative(resolve(root, 'src'), path).startsWith('..')) throw new Error(`Import outside src: ${path}`);
        return { path, namespace: 'game-source' };
      });
      builder.onLoad({ filter: /\.(?:js|json)$/, namespace: 'game-source' }, async args => {
        const json = args.path.endsWith('.json');
        const source = await readFile(args.path, 'utf8');
        return { contents: json ? source : await inlineAssets(source), loader: json ? 'json' : 'js', resolveDir: dirname(args.path) };
      });
    } }],
  });
  let body = await inlineAssets(await readFile(resolve(root, 'src/html/body.html'), 'utf8'));
  body = insert(body, '<!-- MODE CARDS -->', renderModeCards());
  const css = (await Promise.all(CSS_FILES.map(path => readFile(resolve(root, path), 'utf8')))).join('\n');
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  let html = await readFile(resolve(root, 'src/index.template.html'), 'utf8');
  html = insert(html, '<!-- STYLES -->', css);
  html = insert(html, '<!-- BODY -->', body);
  html = insert(html, '<!-- SCRIPTS -->', script);
  // Source files may use different Windows/editor line endings; keep builds uniform.
  html = html.replace(/\r\n/g, '\n');
  if (/\b(?:src|href)\s*=\s*["'](?:\.\/|https?:)/i.test(html)) throw new Error('External resource remained in the build');
  const output = resolve(root, 'dist/app.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(`${output}.tmp`, html);
  try { await access(output); await copyFile(output, resolve(root, 'dist/app_BU.html')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(`${output}.tmp`, output);
  console.log(`Built dist/app.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB; ${assetCache.size} embedded assets).`);
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
