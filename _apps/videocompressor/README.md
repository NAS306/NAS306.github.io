# 프레임핏 · FrameFit

파일을 업로드하지 않고 브라우저 Worker에서 H.264/AAC MP4로 압축하는 정적 앱입니다. 목표 용량은 decimal MB(1MB = 1,000,000바이트)이며 실제 결과가 목표보다 작을 때만 완료합니다.

## 실행과 빌드

Node.js 22.12 이상에서 npm ci, npm run dev, npm test, npm run build를 실행합니다. Windows PowerShell 실행 정책 오류 시 npm.cmd를 사용합니다. npm run preview로 dist/를 확인하며 file:// 실행은 지원하지 않습니다.

build.js는 prepare-assets.js로 설치된 FFmpeg 코어를 복사하고 Vite로 모듈을 번들링한 다음 버전별 서비스 워커를 생성합니다. 배포는 단일 HTML 진입점과 JS/CSS/Worker/WASM 자산으로 구성됩니다. 수십 MB WASM을 HTML에 내장하면 메모리·캐시 비용이 커지므로 별도 파일로 유지합니다.

## 모듈

- src/ui/layout.js: 화면과 용량 표시
- src/main.js: UI 상태, 선택·취소·다운로드·공유·PWA 연결
- src/style.css: 반응형 화면
- src/core/compressionPlanner.js: 영상·음성 용량 예산, 해상도·FPS, 재시도
- src/core/compressionEngine.js: 가속 엔진 우선 선택, 미지원 시 호환 엔진, 취소·정리
- src/core/nativeWorker.js: Mediabunny 스트리밍 읽기·MP4 처리와 WebCodecs 인코딩
- src/core/ffmpegEngine.js: FFmpeg 단일/멀티스레드, ffprobe, WORKERFS 입력, 인코딩
- src/serviceWorker.js: 앱 경로의 오프라인 캐시와 cross-origin isolation 헤더
- prepare-assets.js / build.js / vite.config.js: 코어 복사·번들·서비스 워커 생성
- tests/acceleration.test.js / tests/engine.test.js / tests/planner.test.js: 복구·취소·입력 메모리·용량·음성 정책
- tests/browser-smoke.mjs: 실제 배포 번들의 압축·취소·재시작·모바일 폭·오프라인 검증
- tests/audio-integrity.mjs: AAC 패킷 해시, 고음질 변환, 음질 OFF, 음성 제거
- tests/acceleration.mjs / tests/benchmarkHarness.js: 배포와 동일한 번들 방식의 성능 측정

엔진의 prepare / encode / cancel / clean / dispose 인터페이스를 유지합니다. @ffmpeg/core와 core-mt는 0.12.10, wrapper는 0.12.15, Mediabunny는 1.61.3으로 고정하고 package-lock.json을 함께 관리합니다. 변경 전 파일명_BU.확장자로 백업하며 백업과 생성 코어는 소스에 커밋하지 않습니다.

## 속도와 메모리

WebCodecs를 사용할 수 있으면 브라우저 기본 인코더를 먼저 사용합니다. 하드웨어 인코더를 우선 요청하지만 브라우저·GPU·코덱에 따라 소프트웨어 인코더가 선택될 수 있습니다. GPU 사용이나 모든 기기의 동일한 속도는 보장하지 않습니다. 파일 전체를 WASM에 복사하는 대신 BlobSource로 필요한 부분을 읽고 Worker에서 처리합니다.

코덱 변환이 지원되지 않으면 FFmpeg로 자동 전환합니다. SharedArrayBuffer가 허용되는 격리 환경에서는 CPU에 따라 인코더 스레드를 2~6개 사용합니다. 필터 스레드는 1개로 제한하여 과도한 스레드 경쟁을 피합니다. 멀티스레드 초기화 실패 시 단일 스레드로 복구합니다. 기본 인코딩은 libx264 veryfast 1패스와 VBV 제한입니다. 2패스 옵션은 비교 벤치마크용이며 UI에서는 사용하지 않습니다. 영상 전체를 항상 두 번 처리하던 비용을 제거했습니다.

최종 바이트 검증은 유지합니다. 목표를 넘으면 영상 비트레이트만 낮춰 최대 3회 추가 변환하고, 그래도 달성하지 못하면 오류를 표시합니다. 가속 결과가 목표를 달성하지 못한 경우 호환 엔진으로 전체 작업을 또 실행하지 않습니다. 취소 시 Worker를 즉시 종료합니다.

## 설정과 음질

고급 설정은 기본으로 열리고 프리셋은 없습니다. 목표 MB와 최대 FPS를 직접 입력합니다. 기본 최대 FPS는 30이며 원본을 초과하지 않습니다. 작은 목표에서는 해상도를 조절하고 원본 해상도 유지 옵션으로 이를 막습니다. 극단적인 용량 감소에는 화질 손실이 있습니다.

음질 유지하기는 기본 ON입니다. AAC는 원본 패킷을 복사하고 음성 용량을 영상 예산보다 먼저 확보합니다. AAC 비트레이트가 없으면 원본 패킷 또는 무손실 remux로 확인합니다. 다른 음성 코덱은 원본 채널·샘플레이트를 유지한 고음질 AAC로 변환합니다(모노 128kbps, 스테레오 256kbps, 최대 512kbps). MP3/Opus/Vorbis 원본이 더 높은 비트레이트면 512kbps까지 반영합니다. 다른 코덱의 변환은 무손실을 보장하지 않습니다. OFF는 64kbps AAC, 음성 유지 OFF는 트랙 제거입니다. 목표가 음성 예산보다 작으면 음질을 낮추지 않고 오류를 표시합니다.

## GitHub 블로그 배포

공개 주소: https://nas306.github.io/videocompressor/

NAS306/NAS306.github.io main 루트의 기존 Pages 배포를 사용합니다. 공개 자산은 videocompressor/, 소스는 Jekyll이 제외하는 _apps/videocompressor/에 둡니다. 코어는 npm 설치 후 생성하므로 public/ffmpeg/와 public/ffmpeg-mt/는 숨겨진 소스에 복사하지 않습니다. 기존 블로그 루트를 유지하기 위해 앱 전용 deploy.yml을 블로그 워크플로로 복사하지 않습니다.

로컬 검증 후 deployment/redeploy.mjs로 기존 파일을 백업하고 dist/와 소스를 동기화합니다. 이전 해시 자산은 백업 후 제거합니다. 변경은 두 앱 경로만 커밋·push하고 기존 Pages build and deployment 성공과 공개 주소 압축을 확인합니다.

서비스 워커는 /videocompressor/ 범위 응답에 COOP/COEP/CORP 헤더를 적용합니다. 최초 제어 후 파일 선택·작업이 없는 경우 한 번 새로고침해 SharedArrayBuffer를 활성화합니다. 별도 서버나 브라우저 보안 설정 변경은 필요하지 않습니다. 블로그의 다른 경로에는 적용하지 않습니다.

## PWA와 오프라인

앱·가속 Worker·단일 스레드 FFmpeg를 기본 캐싱합니다(약 32MB 이상). 추가 멀티스레드 코어 약 32MB는 필요할 때 다운로드·캐싱합니다. 기본 캐시 준비 후 오프라인 실행이 가능합니다. 미캐싱 멀티스레드는 오프라인 로딩 실패 시 단일 코어로 복구합니다. 입력 영상과 결과 Blob은 저장하지 않습니다. 새 빌드는 별도 캐시를 만들고 활성화 시 이전 버전을 삭제합니다. 기존 탭을 모두 닫고 재접속해야 새 버전이 적용될 수 있습니다.

앱 설치는 홈 화면·별도 창·오프라인 이용을 위한 기능이며 설치 자체가 인코딩을 빠르게 하지는 않습니다. 캐시가 삭제되면 온라인 접속으로 다시 준비해야 합니다. iOS는 Safari 공유 메뉴의 홈 화면에 추가를 사용합니다.

## 검증

npm test로 정책과 취소·복구를 검증합니다. node tests/browser-smoke.mjs로 로컬 dist/를 검사합니다. SMOKE_URL 환경 변수에 공개 주소를 넣으면 Pages에서 같은 검증을 실행합니다. node tests/audio-integrity.mjs는 단일 스레드, AUDIO_MT=1 환경 변수는 멀티스레드를 검사합니다. Windows Edge 설치 경로는 테스트 스크립트에서 조정할 수 있습니다.

node tests/acceleration.mjs는 10초 720p 비교 및 4분 1600×900·30FPS의 대용량 합성 샘플을 생성해 실제 처리 시간을 측정합니다. 소스 생성 시간과 엔진 다운로드는 인코딩 시간에서 분리합니다. 결과는 tests/acceleration-results.json에 CPU·브라우저·입출력 크기·길이·AAC 해시와 함께 기록합니다. 합성 샘플은 사용자가 제공한 실제 영상과 동일하지 않습니다.

2026-10-12: 단위 테스트 19개, 무음·음성 압축, 취소·재시작, 320px UI, 오프라인 압축·재생 메타데이터 통과. 단일/멀티스레드 모두 MP4·MKV AAC 원본과 결과 SHA-256 해시가 동일하며 스테레오 48kHz 변환·음질 OFF·음성 제거를 확인했습니다. 가속 경로의 AAC 원본 패킷과 영상 길이도 실제 결과로 검증합니다.

500MB 입력 제한을 유지하며 성공 가능한 크기는 기기 메모리에 달려 있습니다. WORKERFS 미지원 환경은 파일을 메모리에 복사하므로 추가 비용이 있습니다. 모든 모바일·Firefox·Safari·회전 영상·강제 메모리 부족은 별도 실기기 검증 대상입니다. 처리 도중 탭과 화면을 유지하세요.

참고: https://www.w3.org/TR/webcodecs/ , https://mediabunny.dev/guide/converting-media-files , https://ffmpegwasm.netlify.app/docs/overview/ .

## 성능 실측 (2026-10-12)

Windows Edge 155 / AMD Ryzen 5 5600U 헤드리스에서 합성 영상으로 측정했습니다.

| 조건 | 이전 단일 스레드 2패스 | 브라우저 가속 | 실제 출력 |
|---|---:|---:|---|
| 10초 1280×720·30FPS, 2MB 목표 | 46.38초 | 2.86초 | 1.95MB, 1238×696 |
| 4분 1600×900·30FPS, 229.78MB → 10MB 목표 | 미측정 | 46.47초 | 9.78MB, 458×256 |

기본 해상도 자동 조절·음질 유지 ON을 사용했습니다. 두 결과 모두 입력과 영상 길이가 같고 원본 AAC 패킷 SHA-256이 일치했습니다. UI 타이머 최대 지연은 약 63ms였습니다. 작은 동일 샘플에서 약 16.2배 개선됐습니다. 사용자의 2,200초 기록은 원본·코덱·기기가 확인되지 않아 동일 파일 비교로 해석하지 않습니다. 원본 해상도 유지와 다른 기기에서는 처리 시간이 달라집니다. 다운로드 및 합성 소스 생성 시간은 위 인코딩 시간에 포함되지 않습니다.
