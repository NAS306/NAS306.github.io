import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/ffmpeg', { recursive: true });
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) await copyFile(`node_modules/@ffmpeg/core/dist/esm/${name}`, `public/ffmpeg/${name}`);

await mkdir('public/ffmpeg-mt', { recursive: true });
for (const name of ['ffmpeg-core.js','ffmpeg-core.wasm','ffmpeg-core.worker.js']) await copyFile(`node_modules/@ffmpeg/core-mt/dist/esm/${name}`, `public/ffmpeg-mt/${name}`);
