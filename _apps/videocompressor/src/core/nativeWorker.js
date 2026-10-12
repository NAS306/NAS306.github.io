import { Input, ALL_FORMATS, BlobSource, Output, BufferTarget, Mp4OutputFormat, Conversion, Quality } from 'mediabunny';
import { lowerBitrate, MAX_RETRIES } from './compressionPlanner.js';
let input, video, audio, metadata;
async function prepare(file) {
  input?.dispose();
  input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  video = await input.getPrimaryVideoTrack(); audio = await input.getPrimaryAudioTrack();
  if (!video) throw new Error('영상 트랙이 없습니다.');
  const duration = (await input.getDurationFromMetadata()) || await input.computeDuration();
  const stats = await video.computePacketStats(120);
  const audioCodec = audio ? await audio.getCodec() : null;
  let audioBitrate = audio ? (await audio.getAverageBitrate()) || (await audio.getBitrate()) || 0 : 0;
  if (audioCodec === 'aac' && !audioBitrate) audioBitrate = (await audio.computePacketStats()).averageBitrate;
  const audioDuration = audio ? (await audio.getDurationFromMetadata()) || duration : 0;
  metadata = { duration, width: await video.getDisplayWidth(), height: await video.getDisplayHeight(), fps: stats.averagePacketRate > 0 && stats.averagePacketRate <= 240 ? stats.averagePacketRate : null, hasAudio: !!audio, audioCodec, audioBitrate: Math.ceil(audioBitrate * audioDuration / duration), audioChannels: audio ? await audio.getNumberOfChannels() : 0, audioSampleRate: audio ? await audio.getSampleRate() : 0 };
  if (!(duration > 0) || !metadata.width || !metadata.height) throw new Error('미디어 정보를 확인할 수 없습니다.');
  return metadata;
}
async function encode(originalPlan, id) {
  if (!globalThis.VideoEncoder || !globalThis.VideoDecoder) throw new Error('WebCodecs 미지원');
  const plan = { ...originalPlan };
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Prefer an OS/device encoder when available; fall back to the browser's native software encoder.
    let conversion, target;
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      target = new BufferTarget();
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      conversion = await Conversion.init({ input, output,
        video: track => track !== video ? { discard: true } : { codec: 'avc', width: plan.width, height: plan.height, fit: 'fill', frameRate: plan.fps, quality: new Quality({ bitrate: plan.videoBitrate }), hardwareAcceleration, forceTranscode: true, allowTransformationMetadata: false },
        audio: track => track !== audio || plan.audioMode === 'none' ? { discard: true } : plan.audioMode === 'copy' ? { codec: 'aac' } : { codec: 'aac', quality: new Quality({ bitrate: plan.audioBitrate }), numberOfChannels: metadata.audioChannels, sampleRate: metadata.audioSampleRate, forceTranscode: true }
      });
      if (conversion.isValid && conversion.utilizedTracks.includes(video) && (plan.audioMode === 'none' || conversion.utilizedTracks.includes(audio))) break;
      await conversion.cancel(); conversion = null;
    }
    if (!conversion) throw new Error('브라우저가 이 영상 또는 음성 코덱의 변환을 지원하지 않습니다.');
    let last = 0;
    conversion.onProgress = progress => { const now = performance.now(); if (now - last > 100 || progress >= 1) { last = now; self.postMessage({ id, status: `${attempt + 1}차 압축 · 브라우저 가속`, progress: progress * 100 }); } };
    await conversion.execute();
    self.postMessage({ id, status: '목표 용량 검증 중…' });
    const buffer = target.buffer;
    if (buffer.byteLength < plan.targetBytes) { self.postMessage({ id, result: buffer }, [buffer]); return; }
    plan.videoBitrate = lowerBitrate(plan.videoBitrate, buffer.byteLength, plan.targetBytes, plan.audioBitrate * plan.duration / 8);
    if (plan.videoBitrate < 12000) break;
  }
  const error = new Error('가속 인코딩 후에도 목표 용량을 달성하지 못했습니다.'); error.code = 'TARGET'; throw error;
}
self.onmessage = async ({ data }) => {
  try {
    if (data.action === 'prepare') self.postMessage({ id: data.id, result: await prepare(data.file) });
    else if (data.action === 'encode') await encode(data.plan, data.id);
  } catch (error) { self.postMessage({ id: data.id, error: error.message, code: error.code }); }
};
