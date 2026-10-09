import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile,writeFile,copyFile } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
const root=resolve('.');const types={'.js':'text/javascript','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<script type="importmap">{"imports":{"@ffmpeg/ffmpeg":"/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js"}}</script>');return;}try{const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/ffmpeg\//,'/public/ffmpeg/');const p=resolve(root,'.'+pathname);if(!p.startsWith(root+sep))throw Error();res.setHeader('Content-Type',types[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}}).listen(4175,'127.0.0.1');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const page=await browser.newPage();page.on('console',m=>console.log(m.text()));await page.goto('http://127.0.0.1:4175');
  const results=await page.evaluate(async()=>{
    const {FFmpegEngine}=await import('/src/core/ffmpegEngine.js');const {planCompression}=await import('/src/core/compressionPlanner.js');const engine=new FFmpegEngine();await engine.load(()=>{});const f=engine.ffmpeg;const results=[];
    const require=(condition,message)=>{if(!condition)throw Error(message);};
    const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(n=>n.toString(16).padStart(2,'0')).join('');
    const probe=async pathname=>{await f.ffprobe(['-v','error','-show_streams','-of','json',pathname,'-o','check.json']);return JSON.parse(await f.readFile('check.json','utf8'));};
    for(const kind of ['aac-mp4','aac-mkv','pcm']) {
      console.log('testing',kind);await engine.clean();const generator=new FFmpegEngine();await generator.load(()=>{});const g=generator.ffmpeg;
      const name=kind==='aac-mp4'?'fixture.mp4':kind==='aac-mkv'?'fixture.mkv':'pcm-fixture.mkv';
      const codec=kind==='pcm'?'pcm_s16le':'aac';const video=['-c:v','libx264','-preset','ultrafast'];
      require(await g.exec(['-f','lavfi','-i','testsrc2=size=320x240:rate=30','-f','lavfi','-i','aevalsrc=0.25*sin(2*PI*440*t)|0.25*sin(2*PI*880*t):s=48000','-t','2',...video,'-c:a',codec,'-b:a','192000',name])===0,'fixture failed');
      const input=await g.readFile(name);generator.dispose();const file=new File([input],name);
      console.log('prepare',kind);const meta=await engine.prepare(file,()=>{});engine.duration=meta.duration;
      require(meta.audioChannels===2&&meta.audioSampleRate===48000,'input channel/rate mismatch');
      const plan=planCompression(meta,{targetMB:.25,audio:true,maxFPS:30});
      let blob;try { blob=await engine.encode(plan,()=>{}); } catch(error) { console.log(kind,JSON.stringify(plan),JSON.stringify(engine.logs)); throw error; }require(blob.size<250000,'target exceeded');
      console.log('probe output',kind);const info=await probe('output.mp4');const audio=info.streams.find(s=>s.codec_type==='audio');require(audio?.codec_name==='aac'&&audio.channels===2&&Number(audio.sample_rate)===48000,'output channel/rate mismatch');
      if(kind!=='pcm') {
        require(plan.audioMode==='copy','AAC not copied');
        require(await f.exec(['-i',engine.inputPath,'-map','0:a:0','-c:a','copy','-f','adts','original.aac'])===0,'input extract failed');
        require(await f.exec(['-i','output.mp4','-map','0:a:0','-c:a','copy','-f','adts','result.aac'])===0,'output extract failed');
        console.log('compare',kind);const original=await hash(await f.readFile('original.aac'));const output=await hash(await f.readFile('result.aac'));require(original===output,'AAC payload changed');
        results.push({kind,bytes:blob.size,audioBitrate:meta.audioBitrate,audioHash:original,originalPayloadUnchanged:true});
      } else {
        require(plan.audioBitrate===256000,'high quality stereo budget incorrect');results.push({kind,bytes:blob.size,audioMode:plan.audioMode,plannedAudioBitrate:plan.audioBitrate,actualAudioBitrate:Number(audio.bit_rate),channels:audio.channels,sampleRate:Number(audio.sample_rate)});
        const low=planCompression(meta,{targetMB:.25,audio:true,preserveAudioQuality:false,maxFPS:30});await engine.encode(low,()=>{});const lowAudio=(await probe('output.mp4')).streams.find(s=>s.codec_type==='audio');require(Number(lowAudio.bit_rate)<Number(audio.bit_rate),'OFF did not lower audio budget');
        const none=planCompression(meta,{targetMB:.25,audio:false,maxFPS:30});await engine.encode(none,()=>{});require(!(await probe('output.mp4')).streams.some(s=>s.codec_type==='audio'),'audio removal failed');
        results.push({kind:'quality-off-and-audio-removal',compactAudioBitrate:Number(lowAudio.bit_rate),passed:true});
      }
    }
    engine.dispose();return results;
  });
  try { await copyFile('tests/audio-results.json','tests/audio-results_BU.json'); } catch(error) { if(error.code!=='ENOENT')throw error; }
  await writeFile('tests/audio-results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();server.close();}
