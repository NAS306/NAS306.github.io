import './style.css';
import { layout, mb } from './ui/layout.js';
import { FFmpegEngine } from './core/ffmpegEngine.js';
import { planCompression } from './core/compressionPlanner.js';
document.querySelector('#app').innerHTML = layout;
const $ = id => document.getElementById(id);
const engine = new FFmpegEngine();
let file, meta, inputURL, outputURL, busy = false, timer, started, outputBlob, installPrompt;
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
function status(text, value) { $('stage').textContent = text; if (value === undefined) { $('progress').removeAttribute('value'); $('percent').textContent = ''; } else { $('progress').value = value; $('percent').textContent = `${value.toFixed(1)}% · 현재 패스`; } }
function lock(value) { busy = value; $('settings').disabled = value; $('file').disabled = value; $('start').disabled = value || !meta; $('progress-panel').hidden = !value; if (!value) clearInterval(timer); }
function clearResult() { $('output').pause(); $('output').removeAttribute('src'); $('output').load(); if (outputURL) URL.revokeObjectURL(outputURL); outputURL = null; outputBlob = null; $('result').hidden = true; }
async function selectFile(selected) {
  if (!selected || busy) return;
  clearResult(); message(''); file = selected; meta = null;
  if (inputURL) URL.revokeObjectURL(inputURL);
  inputURL = URL.createObjectURL(file); $('preview').src = inputURL; $('preview').hidden = false;
  $('metadata').textContent = `${file.name} · ${mb(file.size)}`;
  if (file.size > 500000000) { message('500MB 이상 파일은 이 앱의 안전 제한을 초과합니다. 짧게 나누거나 데스크톱 도구를 사용하세요.', true); $('start').disabled = true; return; }
  lock(true); started = performance.now(); timer = setInterval(() => $('elapsed').textContent = `${Math.floor((performance.now()-started)/1000)}초`, 1000);
  try { meta = await engine.prepare(file, status); engine.duration = meta.duration; $('metadata').textContent = `${file.name} · ${mb(file.size)} · ${meta.duration.toFixed(1)}초 · ${meta.width}×${meta.height} · ${meta.fps ? meta.fps.toFixed(2) + 'FPS' : 'FPS 미확인 (압축 기본 30FPS)'} · ${meta.hasAudio ? '음성 있음' : '음성 없음'}`; if (file.size > 150000000) message('큰 영상은 모바일 메모리 한계를 초과할 수 있습니다.'); }
  catch (error) { message(engine.cancelled ? '영상 분석을 취소했습니다. 파일을 다시 선택하세요.' : error.message, true); engine.dispose(); }
  finally { lock(false); }
}
$('file').addEventListener('change', e => selectFile(e.target.files[0]));
$('drop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) $('file').click(); } });
for (const event of ['dragover','drop']) $('drop').addEventListener(event, e => { e.preventDefault(); if (event === 'drop') selectFile(e.dataTransfer.files[0]); });
for (const button of document.querySelectorAll('[data-size]')) button.onclick = () => { $('target').value = button.dataset.size; updatePresets(); };
function updatePresets() { for (const button of document.querySelectorAll('[data-size]')) button.setAttribute('aria-pressed', String(Number(button.dataset.size) === Number($('target').value))); }
$('target').oninput = updatePresets; $('custom').onclick = () => { $('target').focus(); $('target').select(); };
$('start').onclick = async () => {
  if (busy || !meta) return;
  let plan;
  try { plan = planCompression(meta, { targetMB: Number($('target').value), mode: $('mode').value, audio: $('audio').checked, keepResolution: $('resolution').checked }); } catch (error) { message(error.message, true); return; }
  $('preview').pause();
  clearResult(); message(plan.warning); lock(true); started = performance.now();
  timer = setInterval(() => $('elapsed').textContent = `${Math.floor((performance.now()-started)/1000)}초`,1000);
  try {
    await engine.prepare(file, status); engine.duration = meta.duration;
    outputBlob = await engine.encode(plan, status);
    outputURL = URL.createObjectURL(outputBlob); $('output').src = outputURL;
    const filename = file.name.replace(/\.[^.]+$/, '') + '_compressed.mp4';
    $('download').href = outputURL; $('download').download = filename;
    const reduction = (1 - outputBlob.size / file.size) * 100;
    $('stats').textContent = `원본 ${mb(file.size)} → 결과 ${mb(outputBlob.size)} / 절약 ${mb(Math.max(0,file.size-outputBlob.size))} (${reduction.toFixed(1)}%) / ${meta.width}×${meta.height} → ${plan.width}×${plan.height} · ${plan.fps.toFixed(2)}FPS / ${((performance.now()-started)/1000).toFixed(1)}초`;
    $('result').hidden = false;
    $('share').hidden = !navigator.canShare?.({ files: [new File([outputBlob], filename, { type:'video/mp4' })] });
    message(outputBlob.size >= file.size ? '목표 용량은 달성했지만 결과가 원본보다 큽니다. 원본을 사용하는 편이 좋습니다.' : '목표 용량 미만의 MP4가 준비되었습니다.');
  } catch (error) { message(engine.cancelled ? '압축을 취소했습니다. 파일을 다시 선택해 시작하세요.' : error.message, true); meta = null; engine.dispose(); }
  finally { await engine.clean().catch(() => {}); lock(false);  }
};
$('cancel').onclick = () => engine.cancel();
$('reset').onclick = () => { engine.dispose(); clearResult(); meta = null; file = null; $('file').value = ''; $('preview').pause(); $('preview').removeAttribute('src'); $('preview').load(); $('preview').hidden = true; if (inputURL) URL.revokeObjectURL(inputURL); inputURL = null; $('metadata').textContent = '새 영상을 선택하세요.'; $('start').disabled = true; message(''); $('drop').focus(); };
$('share').onclick = async () => { try { await navigator.share({ files:[new File([outputBlob], $('download').download, {type:'video/mp4'})] }); } catch (error) { if (error.name !== 'AbortError') message('공유하지 못했습니다. 다운로드를 이용하세요.',true); } };
$('environment').textContent = `단일 스레드 엔진 · 멀티스레드 환경 ${globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined' ? '사용 가능' : '미지원'}`;
addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
addEventListener('pagehide', () => { engine.dispose(); if (inputURL) URL.revokeObjectURL(inputURL); if (outputURL) URL.revokeObjectURL(outputURL); });
addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = false; });
$('install').onclick = async () => { await installPrompt?.prompt(); $('install').hidden = true; };
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').then(async registration => {
  const check = async () => { const keys = await caches.keys(); $('offline').textContent = keys.some(k=>k.startsWith('framefit-' + registration.scope + '-')) ? '오프라인 자산 준비 완료 · 저장 공간 정리 시 삭제될 수 있습니다' : '앱과 엔진을 오프라인용으로 저장하는 중…'; };
  registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check)); await navigator.serviceWorker.ready; await check();
}).catch(() => $('offline').textContent = '오프라인 준비 실패 · 온라인으로 이용하세요.');
else $('offline').textContent = '오프라인 기능은 배포 빌드의 HTTPS 또는 localhost에서 제공됩니다.';
