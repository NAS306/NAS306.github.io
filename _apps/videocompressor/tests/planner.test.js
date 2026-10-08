import test from 'node:test';
import assert from 'node:assert/strict';
import { planCompression, lowerBitrate, encodingArgs } from '../src/core/compressionPlanner.js';
const meta = { duration:120, width:1920, height:1080, fps:60, hasAudio:true };
test('decimal MB and audio budget',()=>{const p=planCompression(meta,{targetMB:10,audio:true,mode:'auto'});assert.equal(p.targetBytes,10000000);assert.equal(p.videoBitrate,Math.floor(10000000*.97*8/120-64000));assert.equal(p.fps,30);assert.equal(p.width%2,0);});
test('silent input reserves no audio',()=>{assert.equal(planCompression({...meta,hasAudio:false},{targetMB:5,audio:true,mode:'auto'}).audioBitrate,0);});
test('quality mode preserves frame rate and locked resolution',()=>{const p=planCompression(meta,{targetMB:10,audio:true,mode:'quality',keepResolution:true});assert.equal(p.fps,60);assert.equal(p.width,1920);});
test('impossible budgets rejected',()=>{assert.throws(()=>planCompression(meta,{targetMB:.01,audio:true,mode:'auto'}));});
test('oversize adjustment reduces bitrate',()=>assert.ok(lowerBitrate(100000,1100000,1000000)<100000));
test('two pass commands use shared pass log',()=>{const p=planCompression(meta,{targetMB:5,audio:false,mode:'extreme'});assert.ok(encodingArgs(p,1).includes('odo-pass'));assert.ok(encodingArgs(p,2).includes('output.mp4'));});

test('speed policy retains quality mode preset',()=>{for(const mode of ['auto','extreme','quality']) { const plan=planCompression(meta,{targetMB:10,audio:true,mode}); assert.equal(plan.preset,mode==='quality'?'fast':'veryfast'); const args=encodingArgs(plan,2); assert.equal(args[args.indexOf('-preset')+1],plan.preset); }});
