import test from 'node:test';
import assert from 'node:assert/strict';
import {CompressionEngine} from '../src/core/compressionEngine.js';
const metadata={duration:10,width:640,height:360,fps:30,hasAudio:true,audioCodec:'aac',audioBitrate:128000};
const plan={duration:10,targetBytes:1000000,audioMode:'copy',audioBitrate:128000,videoBitrate:600000};
test('unsupported native codec uses the compatible encoder without changing audio policy',async()=>{
 const engine=new CompressionEngine();const file=new File(['sample'],'video.mp4');engine.request=async action=>{if(action==='prepare')return metadata;throw Error('unsupported codec');};let received;
 engine.fallback={backend:'FFmpeg 멀티스레드 (4)',prepare:async f=>{assert.strictEqual(f,file);return metadata;},encode:async p=>{received=p;return new Blob(['output']);}};
 await engine.prepare(file,()=>{});const result=await engine.encode(plan,()=>{});assert.ok(result.size>0);assert.deepEqual(received,plan);assert.notStrictEqual(received,plan);assert.equal(engine.backend,'FFmpeg 멀티스레드 (4)');
});
test('unattainable native target is reported without a second expensive engine run',async()=>{
 const engine=new CompressionEngine();engine.request=async()=>{const error=Error('target too small');error.code='TARGET';throw error;};engine.fallback.prepare=async()=>assert.fail('Unexpected fallback');
 await assert.rejects(engine.encode(plan,()=>{}),{code:'TARGET'});
});
test('cancel rejects pending native work and releases worker and input',async()=>{
 const engine=new CompressionEngine();let terminated=false;engine.worker={terminate(){terminated=true;}};engine.file=new File(['sample'],'video.mp4');engine.metadata=metadata;
 const pending=new Promise((resolve,reject)=>engine.pending.set(1,{resolve,reject}));engine.cancel();await assert.rejects(pending,/중지/);assert.ok(terminated);assert.equal(engine.cancelled,true);assert.equal(engine.worker,null);assert.equal(engine.file,null);assert.equal(engine.pending.size,0);
});
