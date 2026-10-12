import { FFmpegEngine } from './ffmpegEngine.js';
export class CompressionEngine {
  constructor() { this.fallback = new FFmpegEngine(); this.worker = null; this.pending = new Map(); this.sequence = 0; this.file = null; this.metadata = null; this.cancelled = false; this.backend = '브라우저 가속'; }
  request(action, payload, status) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./nativeWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => { const job = this.pending.get(data.id); if (!job) return; if (data.status) { job.status?.(data.status, data.progress); return; } this.pending.delete(data.id); if (data.error) { const error = new Error(data.error); error.code = data.code; job.reject(error); } else job.resolve(data.result); };
      this.worker.onerror = () => this.stopNative(new Error('가속 Worker를 실행하지 못했습니다.'));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject, status }); this.worker.postMessage({ id, action, ...payload }); });
  }
  stopNative(error = new Error('작업을 중지했습니다.')) { this.worker?.terminate(); this.worker = null; for (const job of this.pending.values()) job.reject(error); this.pending.clear(); }
  async prepare(file, status) {
    this.cancelled = false;
    if (this.file === file && this.metadata) return this.metadata;
    this.file = file; this.metadata = null;
    try { status('영상 분석 중…'); this.metadata = await this.request('prepare', { file }, status); this.backend = '브라우저 가속'; }
    catch (error) { if (this.cancelled) throw error; this.stopNative(); this.metadata = await this.fallback.prepare(file, status); this.backend = '호환 엔진'; }
    return this.metadata;
  }
  async encode(plan, status) {
    if (this.backend === '브라우저 가속') {
      try { const data = await this.request('encode', { plan }, status); return new Blob([data], { type: 'video/mp4' }); }
      catch (error) { if (this.cancelled || error.code === 'TARGET') throw error; this.stopNative(); status('가속 미지원 · 호환 엔진 준비 중…'); }
    }
    await this.fallback.prepare(this.file, status); this.fallback.duration = this.metadata.duration; this.backend = this.fallback.backend;
    return this.fallback.encode({ ...plan }, status);
  }
  cancel() { this.cancelled = true; this.stopNative(); this.fallback.cancel(); this.file = null; this.metadata = null; }
  async clean() { this.stopNative(); await this.fallback.clean(); this.file = null; this.metadata = null; }
  dispose() { this.stopNative(); this.fallback.dispose(); this.file = null; this.metadata = null; }
}
