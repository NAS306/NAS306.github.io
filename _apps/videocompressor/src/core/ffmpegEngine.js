import { FFmpeg } from '@ffmpeg/ffmpeg';
import { encodingArgs, lowerBitrate, MAX_RETRIES } from './compressionPlanner.js';
export class FFmpegEngine {
  constructor() { this.ffmpeg = null; this.logs = []; this.cancelled = false; this.preparedFile = null; this.metadata = null; this.mounted = false; this.inputPath = null; }
  cancel() { this.cancelled = true; this.dispose(); }
  async load(status) {
    if (this.ffmpeg?.loaded) return;
    if (!globalThis.WebAssembly || !globalThis.Worker) throw new Error('이 브라우저는 WebAssembly 또는 Worker를 지원하지 않습니다. 최신 브라우저로 다시 시도하세요.');
    const ffmpeg = this.ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => { this.logs.push(message); if (this.logs.length > 100) this.logs.shift(); });
    status('압축 엔진 준비 중…');
    try { await ffmpeg.load({ coreURL: new URL('ffmpeg/ffmpeg-core.js', document.baseURI).href, wasmURL: new URL('ffmpeg/ffmpeg-core.wasm', document.baseURI).href }); }
    catch (error) { this.dispose(); throw new Error('압축 엔진을 불러오지 못했습니다. 네트워크·메모리·브라우저 저장 공간을 확인하고 다시 시도하세요.', { cause: error }); }
  }
  async prepare(file, status) {
    this.cancelled = false;
    await this.load(status);
    if (this.preparedFile === file && this.metadata) return this.metadata;
    status('영상 분석 중…');
    const f = this.ffmpeg;
    await this.clean();
    // WORKERFS reads Blob slices in the Worker instead of duplicating the whole input in MEMFS.
    await f.createDir('/source');
    try { this.mounted = await f.mount('WORKERFS', { blobs: [{ name: 'input', data: file }] }, '/source'); }
    catch { this.mounted = false; }
    if (this.mounted) this.inputPath = '/source/input';
    else {
      await f.deleteDir('/source');
      await f.writeFile('input', new Uint8Array(await file.arrayBuffer()));
      this.inputPath = 'input';
    }
    await f.ffprobe(['-v','error','-show_streams','-show_format','-of','json',this.inputPath,'-o','metadata.json']);
    let info;
    try { info = JSON.parse(await f.readFile('metadata.json', 'utf8')); } catch { throw new Error('영상 분석에 실패했습니다. 손상된 파일 또는 지원되지 않는 형식일 수 있습니다.'); }
    // core 0.12.10 ffprobe can leave ret=-1 even when valid JSON is written. Validate output instead.
    const video = info.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
    if (!video) throw new Error('영상 트랙이 없는 파일입니다.');
    const rate = value => { const [a,b] = (value || '0/1').split('/').map(Number); return a / b || 0; };
    const average = rate(video.avg_frame_rate);
    const nominal = rate(video.r_frame_rate);
    const fps = average > 0 && average <= 240 ? average : nominal > 0 && nominal <= 240 ? nominal : null;
    const duration = Number(info.format.duration || video.duration);
    if (!(duration > 0) || !video.width || !video.height) throw new Error('영상 길이 또는 해상도를 확인할 수 없습니다.');
    const rotation = Number(video.tags?.rotate || video.side_data_list?.find(s => s.rotation !== undefined)?.rotation || 0);
    const swap = Math.abs(rotation) % 180 === 90;
    const audio = info.streams.find(s => s.codec_type === 'audio');
    let audioBitrate = Number(audio?.bit_rate) || 0;
    if (audio?.codec_name === 'aac' && !audioBitrate) {
      status('원본 음성 용량 확인 중…');
      // Only when metadata lacks AAC bitrate: remux without decoding to reserve its real size.
      if (await f.exec(['-i',this.inputPath,'-map','0:a:0','-c:a','copy','audio-budget.m4a']) !== 0) throw new Error('원본 AAC 음성 용량을 확인하지 못했습니다.');
      const audioData = await f.readFile('audio-budget.m4a');
      audioBitrate = Math.ceil(audioData.byteLength * 8 / duration);
      await f.deleteFile('audio-budget.m4a');
    } else if (audioBitrate) {
      audioBitrate = Math.ceil(audioBitrate * (Number(audio?.duration) || duration) / duration);
    }
    this.preparedFile = file;
    return this.metadata = { duration, width: swap ? video.height : video.width, height: swap ? video.width : video.height, fps, hasAudio: !!audio, audioCodec: audio?.codec_name || null, audioBitrate, audioChannels: Number(audio?.channels) || 0, audioSampleRate: Number(audio?.sample_rate) || 0 };
  }
  async encode(plan, status) {
    const f = this.ffmpeg;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      for (const pass of [1,2]) {
        status(`${attempt + 1}차 압축 · ${pass}/2 패스`);
        let lastUpdate = 0;
        const listener = ({ time }) => { const now = performance.now(); if (now - lastUpdate < 100 && time < this.duration * 1000000) return; lastUpdate = now; status(`${attempt + 1}차 압축 · ${pass}/2 패스`, Math.min(100, Math.max(0, time / 1000000 / this.duration * 100))); };
        f.on('progress', listener);
        try { if (await f.exec(['-i',this.inputPath, ...encodingArgs(plan, pass)]) !== 0) throw new Error('인코딩에 실패했습니다. 지원되지 않는 코덱 또는 메모리 부족일 수 있습니다.'); }
        finally { f.off('progress', listener); }
      }
      status('목표 용량 검증 중…');
      const data = await f.readFile('output.mp4');
      if (data.byteLength < plan.targetBytes) return new Blob([data], { type: 'video/mp4' });
      await f.deleteFile('output.mp4');
      plan.videoBitrate = lowerBitrate(plan.videoBitrate, data.byteLength, plan.targetBytes, plan.audioBitrate * this.duration / 8);
      if (plan.videoBitrate < 12000) break;
    }
    throw new Error('재압축 후에도 목표 용량을 달성하지 못했습니다. 목표 용량을 늘려 다시 시도하세요.');
  }
  async clean() {
    this.preparedFile = null; this.metadata = null; this.inputPath = null;
    if (!this.ffmpeg?.loaded) return;
    if (this.mounted) {
      await this.ffmpeg.unmount('/source');
      await this.ffmpeg.deleteDir('/source');
      this.mounted = false;
    }
    for (const entry of await this.ffmpeg.listDir('/')) if (!entry.isDir) await this.ffmpeg.deleteFile(entry.name).catch(() => {});
  }
  dispose() { this.ffmpeg?.terminate(); this.ffmpeg = null; this.preparedFile = null; this.metadata = null; this.mounted = false; this.inputPath = null; }
}
