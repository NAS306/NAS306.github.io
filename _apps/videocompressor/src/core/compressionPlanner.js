export const MAX_RETRIES = 3;
export function planCompression(meta, settings) {
  const targetBytes = settings.targetMB * 1000000;
  if (!Number.isFinite(targetBytes) || targetBytes < 10000 || targetBytes > 2000000000) throw new Error('목표 용량은 0.01~2,000MB 사이로 입력하세요.');
  const audioBitrate = meta.hasAudio && settings.audio ? (settings.mode === 'extreme' ? 32000 : 64000) : 0;
  const videoBitrate = Math.floor(targetBytes * .97 * 8 / meta.duration - audioBitrate);
  if (videoBitrate < 12000) throw new Error('영상 길이에 비해 목표 용량이 너무 작습니다. 목표 용량을 늘리거나 음성을 제거하세요.');
  let fps = meta.fps || 30;
  if (settings.mode !== 'quality') fps = Math.min(fps, settings.mode === 'extreme' ? 24 : 30);
  let width = meta.width, height = meta.height;
  const density = settings.mode === 'extreme' ? .09 : .055;
  if (!settings.keepResolution) {
    const factor = Math.min(1, Math.sqrt(videoBitrate / (width * height * fps * density)));
    width *= factor; height *= factor;
  }
  width = Math.max(2, Math.floor(width / 2) * 2); height = Math.max(2, Math.floor(height / 2) * 2);
  return { preset: settings.mode === 'quality' ? 'fast' : 'veryfast', targetBytes, audioBitrate, videoBitrate, fps, width, height, warning: videoBitrate < 100000 || width < 320 || height < 240 || (settings.keepResolution && videoBitrate / (width * height * fps) < .03) ? '목표 용량이 작아 화질이 크게 낮아질 수 있습니다.' : '' };
}
export function lowerBitrate(bitrate, actualBytes, targetBytes) { return Math.floor(bitrate * Math.min(.85, targetBytes * .94 / actualBytes)); }
export function encodingArgs(plan, pass) {
  const args = ['-map','0:v:0','-vf',`scale=${plan.width}:${plan.height},setsar=1`,'-r',String(plan.fps),'-c:v','libx264','-preset',plan.preset || 'fast','-b:v',String(plan.videoBitrate),'-pix_fmt','yuv420p','-pass',String(pass),'-passlogfile','odo-pass'];
  if (pass === 1) return [...args,'-an','-f','null','-'];
  return [...args, ...(plan.audioBitrate ? ['-map','0:a:0?','-c:a','aac','-b:a',String(plan.audioBitrate)] : ['-an']),'-movflags','+faststart','output.mp4'];
}
