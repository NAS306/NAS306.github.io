import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import os from 'node:os';
const root = resolve('.');
const types = { '.js':'text/javascript', '.wasm':'application/wasm', '.html':'text/html' };
const server = createServer(async (req,res) => {
  if (req.url === '/') {res.setHeader('Content-Type','text/html');res.end('<script type="importmap">{"imports":{"@ffmpeg/ffmpeg":"/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js"}}</script>');return;}
  try {const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/ffmpeg\//,'/public/ffmpeg/'));if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}
}).listen(4174,'127.0.0.1');
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const report={date:new Date().toISOString(),cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,memoryGB:Math.round(os.totalmem()/2**30),browser:browser.version(),samples:[]};
try {
const page=await browser.newPage();page.on('console',m=>{if(m.type()==='log')console.log(m.text())});
await page.goto('http://127.0.0.1:4174');
await page.evaluate(async()=>{
  const {FFmpegEngine}=await import('/src/core/ffmpegEngine.js');
  window.engine=new FFmpegEngine();
  const t=performance.now();await engine.load(()=>{});window.coldLoadMs=performance.now()-t;
  console.log('Cold engine load: '+coldLoadMs.toFixed(0)+'ms');
});
for (const config of [{width:1280,height:720,duration:10,targetMB:2},{width:1920,height:1080,duration:5,targetMB:2}]) {
console.log('Benchmark '+config.width+'x'+config.height+' '+config.duration+'s');
const result=await page.evaluate(async config=>{
  const {planCompression,encodingArgs}=await import('/src/core/compressionPlanner.js');
  const f=engine.ffmpeg;
  const code=await f.exec(['-f','lavfi','-i',`testsrc2=size=${config.width}x${config.height}:rate=30`,'-t',String(config.duration),'-c:v','libx264','-preset','ultrafast','-crf','18','fixture.mp4']);
  if(code!==0)throw Error('Fixture generation failed');
  const data=await f.readFile('fixture.mp4');
  const file=new File([data],'fixture.mp4',{type:'video/mp4'});
  file.arrayBuffer = () => { throw new Error('Input unexpectedly copied into an ArrayBuffer'); };
  let t=performance.now();const meta=await engine.prepare(file,()=>{});const prepareMs=performance.now()-t;
  t=performance.now();await engine.prepare(file,()=>{});const repeatedPrepareMs=performance.now()-t;
  engine.duration=meta.duration;
  const p=planCompression(meta,{targetMB:config.targetMB,mode:'auto',audio:true,keepResolution:true});
  const presets=[];
  for(const preset of ['fast','veryfast']) {
    const passMs=[];let uiGaps=[];let last=performance.now();const heartbeat=setInterval(()=>{const now=performance.now();uiGaps.push(now-last);last=now;},50);
    for(const pass of [1,2]){const args=encodingArgs(p,pass);args[args.indexOf('-preset')+1]=preset;t=performance.now();if(await f.exec(['-i',engine.inputPath,...args])!==0)throw Error('encode failed');passMs.push(performance.now()-t);}
    clearInterval(heartbeat);
    t=performance.now();const output=await f.readFile('output.mp4');const readMs=performance.now()-t;if(output.byteLength>=p.targetBytes)throw Error('Target exceeded');
    const logs=[];const log=({message})=>logs.push(message);f.on('log',log);
    const ssimCode=await f.exec(['-loglevel','info','-i',engine.inputPath,'-i','output.mp4','-lavfi','ssim','-an','-f','null','-']);f.off('log',log);
    const line=logs.findLast(m=>m.includes('SSIM Y:')) || '';
    const ssim=Number(line.match(/All:([\d.]+)/)?.[1])||null;
    presets.push({preset,passMs,encodeMs:passMs.reduce((a,b)=>a+b),outputBytes:output.byteLength,readMs,ssim,ssimCode,maxUiGapMs:Math.max(...uiGaps)});
    console.log(preset+': '+(passMs.reduce((a,b)=>a+b)/1000).toFixed(2)+'s, '+output.byteLength+' bytes, SSIM '+ssim);
  }
  return {...config,inputBytes:file.size,coldLoadMs,prepareMs,repeatedPrepareMs,mounted:engine.mounted,presets};
},config);
report.samples.push(result);
}
try { await copyFile('tests/performance-results.json','tests/performance-results_BU.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile('tests/performance-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();server.close();}
