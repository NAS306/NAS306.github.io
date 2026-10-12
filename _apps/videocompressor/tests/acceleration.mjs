import {build} from 'vite';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from '@playwright/test';
import {writeFile,copyFile} from 'node:fs/promises';
import os from 'node:os';
await build({configFile:false,base:'./',worker:{format:'es'},build:{outDir:'.bench-dist',rollupOptions:{preserveEntrySignatures:'strict',input:'tests/benchmarkHarness.js',output:{entryFileNames:'harness.js'}}}});
const types={'.js':'text/javascript','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Benchmark</title>');return;}try{const path=resolve('.bench-dist','.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(resolve('.bench-dist')+sep))throw Error();res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}}).listen(4176,'127.0.0.1');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const report={date:new Date().toISOString(),cpu:os.cpus()[0].model,browser:browser.version(),samples:[]};
try{
 const page=await browser.newPage();page.on('console',m=>{console.log(m.type()+': '+m.text())});page.on('pageerror',e=>console.log('pageerror',e.message));await page.goto('http://127.0.0.1:4176/');
 for(const config of [{width:1280,height:720,duration:10,targetMB:2,baseline:true},{width:1600,height:900,duration:240,targetMB:10,sourceBitrate:7500000}]){
 const result=await page.evaluate(async config=>{
  const {FFmpegEngine}=await import('/harness.js');const {CompressionEngine}=await import('/harness.js');const {planCompression}=await import('/harness.js');
  const require=(ok,msg)=>{if(!ok)throw Error(msg);};const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(n=>n.toString(16).padStart(2,'0')).join('');
  console.log('Generating '+config.duration+'s '+config.width+'x'+config.height+' synthetic fixture');
  Object.defineProperty(globalThis,'crossOriginIsolated',{value:false,configurable:true});const generator=new FFmpegEngine();await generator.load(s=>console.log(s));const g=generator.ffmpeg;
  const videoArgs=config.sourceBitrate?['-b:v',String(config.sourceBitrate),'-minrate',String(config.sourceBitrate),'-maxrate',String(config.sourceBitrate),'-bufsize',String(config.sourceBitrate*2),'-x264-params','nal-hrd=cbr']:['-crf','18'];
  require(await g.exec(['-filter_threads','1','-filter_complex_threads','1','-f','lavfi','-i',`testsrc2=size=${config.width}x${config.height}:rate=30`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(config.duration),'-c:v','libx264','-preset','ultrafast',...videoArgs,'-threads',String(generator.threads),'-c:a','aac','-b:a','128000','fixture.mp4'])===0,'Generation failed');
  const file=new File([await g.readFile('fixture.mp4')],'fixture.mp4',{type:'video/mp4'});
  require(await g.exec(['-i','fixture.mp4','-map','0:a:0','-c:a','copy','-f','adts','original.aac'])===0,'AAC extract failed');const originalHash=await hash(await g.readFile('original.aac'));generator.dispose();Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
  file.arrayBuffer=()=>{throw Error('Whole input copied');};console.log('Fixture bytes: '+file.size);
  const engine=new CompressionEngine();let t=performance.now();const metadata=await engine.prepare(file,()=>{});const prepareMs=performance.now()-t;
  const plan=planCompression(metadata,{targetMB:config.targetMB,audio:true,maxFPS:30});console.log('Plan '+JSON.stringify(plan));let maxUiGapMs=0;let last=performance.now();const heartbeat=setInterval(()=>{const now=performance.now();maxUiGapMs=Math.max(maxUiGapMs,now-last);last=now;},50);
  t=performance.now();let lastLog=0;const output=await engine.encode(plan,(s,p)=>{if(performance.now()-lastLog>10000){console.log(s+' '+Math.round(p||0)+'%');lastLog=performance.now();}});const encodeMs=performance.now()-t;clearInterval(heartbeat);require(output.size<plan.targetBytes,'Target exceeded');require(engine.backend==='브라우저 가속','Native path fell back');engine.dispose();
  Object.defineProperty(globalThis,'crossOriginIsolated',{value:false,configurable:true});const verifier=new FFmpegEngine();const checked=await verifier.prepare(new File([output],'result.mp4'),()=>{});const f=verifier.ffmpeg;require(Math.abs(checked.duration-metadata.duration)<.15,'Duration changed');require(checked.hasAudio&&checked.audioSampleRate===metadata.audioSampleRate,'Audio lost or resampled');require(await f.exec(['-i',verifier.inputPath,'-map','0:a:0','-c:a','copy','-f','adts','result.aac'])===0,'Output AAC extract failed');const resultHash=await hash(await f.readFile('result.aac'));require(originalHash===resultHash,'AAC packets changed');verifier.dispose();Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
  const result={...config,inputBytes:file.size,metadata,outputBytes:output.size,outputDuration:checked.duration,outputWidth:checked.width,outputHeight:checked.height,prepareMs,encodeMs,maxUiGapMs,backend:engine.backend,aacPayloadUnchanged:true,audioHash:resultHash};
  if(config.baseline){Object.defineProperty(globalThis,'crossOriginIsolated',{value:false,configurable:true});const legacy=new FFmpegEngine();await legacy.prepare(file,()=>{});legacy.duration=metadata.duration;t=performance.now();await legacy.encode({...plan,twoPass:true},()=>{});result.baselineSingleThreadTwoPassMs=performance.now()-t;legacy.dispose();Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});}
  console.log('Completed '+JSON.stringify(result));return result;
 },config);report.samples.push(result);
 }
 try{await copyFile('tests/acceleration-results.json','tests/acceleration-results_BU.json');}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile('tests/acceleration-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
