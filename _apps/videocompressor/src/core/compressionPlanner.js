export const MAX_RETRIES = 3;
export function planCompression(meta, settings) {
  const targetBytes = settings.targetMB * 1000000;
  if (!Number.isFinite(targetBytes) || targetBytes < 10000 || targetBytes > 2000000000) throw new Error('목표 용량은 0.01~2,000MB 사이로 입력하세요.');
  const maxFPS = settings.maxFPS ?? 30;
  if (!Number.isFinite(maxFPS) || maxFPS < 1 || maxFPS > 120 || !Number.isInteger(maxFPS)) throw new Error('최대 FPS는 1~120 사이의 정수로 입력하세요.');
  const preserveAudioQuality = settings.preserveAudioQuality !== false;
  let audioMode = 'none', audioBitrate = 0;
  if (meta.hasAudio && settings.audio) {
    if (preserveAudioQuality && meta.audioCodec === 'aac') {
      audioMode = 'copy'; audioBitrate = meta.audioBitrate;
      if (!(audioBitrate > 0)) throw new Error('원본 음성 용량을 확인할 수 없습니다. 다른 파일을 선택하거나 음질 유지하기를 끄세요.');
    } else {
      audioMode = 'encode';
      audioBitrate = preserveAudioQuality ? Math.min(512000, Math.max(128000 * (meta.audioChannels || 2), ['mp3','opus','vorbis'].includes(meta.audioCodec) ? (meta.audioBitrate || 0) : 0)) : 64000;
    }
  }
  const videoBitrate = Math.floor(targetBytes * .97 * 8 / meta.duration - audioBitrate);
  if (videoBitrate < 12000) throw new Error(preserveAudioQuality && audioMode !== 'none' ? '음질을 유지하기에는 목표 용량이 너무 작습니다. 목표 용량을 늘리거나 음질 유지하기 또는 음성 유지를 끄세요.' : '영상 길이에 비해 목표 용량이 너무 작습니다. 목표 용량을 늘리거나 음성을 제거하세요.');
  const fps = Math.min(meta.fps || maxFPS, maxFPS);
  let width = meta.width, height = meta.height;
  if (!settings.keepResolution) {
    const factor = Math.min(1, Math.sqrt(videoBitrate / (width * height * fps * .055)));
    width *= factor; height *= factor;
  }
  width = Math.max(2, Math.floor(width / 2) * 2); height = Math.max(2, Math.floor(height / 2) * 2);
  return { duration: meta.duration, preset: 'veryfast', targetBytes, audioMode, audioBitrate, preserveAudioQuality, videoBitrate, fps, width, height, warning: videoBitrate < 100000 || width < 320 || height < 240 || (settings.keepResolution && videoBitrate / (width * height * fps) < .03) ? '목표 용량이 작아 화질이 크게 낮아질 수 있습니다.' : '' };
}
export function lowerBitrate(bitrate, actualBytes, targetBytes, audioBytes = 0) {
  return Math.floor(bitrate * Math.min(.85, (targetBytes * .94 - audioBytes) / Math.max(1, actualBytes - audioBytes)));
}
export function encodingArgs(plan, pass) {
  const args = ['-t',String(plan.duration),'-map','0:v:0','-vf',`scale=${plan.width}:${plan.height},setsar=1,tpad=stop_mode=clone:stop_duration=${1 / plan.fps},fps=${plan.fps}:start_time=0:eof_action=pass`,'-vsync','0','-c:v','libx264','-preset',plan.preset || 'veryfast','-b:v',String(plan.videoBitrate),'-pix_fmt','yuv420p','-pass',String(pass),'-passlogfile','odo-pass'];
  if (pass === 1) return [...args,'-an','-f','null','-'];
  const audioArgs = plan.audioMode === 'copy' ? ['-map','0:a:0','-c:a','copy'] : plan.audioMode === 'encode' ? ['-map','0:a:0','-c:a','aac','-b:a',String(plan.audioBitrate)] : ['-an'];
  return [...args, ...audioArgs,'-movflags','+faststart','output.mp4'];
}
