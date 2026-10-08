import test from 'node:test';
import assert from 'node:assert/strict';
import { FFmpegEngine } from '../src/core/ffmpegEngine.js';
function fixture(mountWorks = true) {
  const calls = { probes:0, writes:0, mounts:0, unmounts:0, terminated:0 };
  const metadata = JSON.stringify({format:{duration:'2'},streams:[{codec_type:'video',width:320,height:240,avg_frame_rate:'30/1'}]});
  const engine = new FFmpegEngine();
  engine.ffmpeg = { loaded:true, listDir:async()=>[], createDir:async()=>{}, deleteDir:async()=>{}, mount:async()=>{calls.mounts++;return mountWorks;}, unmount:async()=>{calls.unmounts++;}, writeFile:async()=>{calls.writes++;}, ffprobe:async()=>{calls.probes++;return -1;}, readFile:async()=>metadata, terminate:()=>{calls.terminated++;} };
  return {engine,calls};
}
test('mounted input avoids whole-file copy and duplicate analysis',async()=>{
  const {engine,calls}=fixture();
  const file=new File(['video'],'sample.mp4');file.arrayBuffer=()=>{throw Error('Whole input copied');};
  const first=await engine.prepare(file,()=>{});const second=await engine.prepare(file,()=>{});
  assert.strictEqual(first,second);assert.equal(calls.probes,1);assert.equal(calls.writes,0);assert.equal(engine.inputPath,'/source/input');
  await engine.clean();assert.equal(calls.unmounts,1);assert.equal(engine.metadata,null);
  await engine.prepare(file,()=>{});assert.equal(calls.probes,2);
});
test('unsupported mount falls back and cancellation invalidates prepared input',async()=>{
  const {engine,calls}=fixture(false);await engine.prepare(new File(['video'],'sample.mp4'),()=>{});
  assert.equal(calls.writes,1);assert.equal(engine.inputPath,'input');engine.cancel();
  assert.equal(calls.terminated,1);assert.equal(engine.cancelled,true);assert.equal(engine.metadata,null);assert.equal(engine.ffmpeg,null);
});
