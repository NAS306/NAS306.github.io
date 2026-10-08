# 프레임핏 · FrameFit

영상 파일을 업로드하지 않고 브라우저 Worker 안의 FFmpeg WebAssembly로 H.264/AAC MP4를 만드는 정적 웹앱입니다. 목표 용량은 decimal MB(1MB = 1,000,000바이트)이며 결과의 실제 바이트 크기가 목표 미만일 때만 완료를 표시합니다.

## 실행과 빌드

Node.js 22.12 이상을 사용합니다.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Windows PowerShell에서 npm.ps1 실행 정책 오류가 나면 `npm.cmd`를 사용하세요. `dist/`를 HTTPS 정적 호스팅에 게시합니다. HTML 파일을 직접 더블클릭하는 file:// 실행은 지원하지 않습니다.

## 모듈과 유지보수

- `src/ui/layout.js`: 화면과 용량 표시
- `src/main.js`: 파일 선택, UI 상태, 미리보기·다운로드·공유, PWA 연결
- `src/style.css`: 반응형 다크 UI
- `src/core/compressionPlanner.js`: 목표 용량 예산, FPS·해상도 정책, 2패스 명령, 재시도 정책
- `src/core/ffmpegEngine.js`: Worker 엔진 수명, ffprobe 분석, 인코딩, 임시 파일 정리
- `src/serviceWorker.js`: 배포 자산만 캐싱하는 서비스 워커 템플릿
- `prepare-assets.js`: 개발·빌드 시 설치된 패키지에서 FFmpeg 코어 복사
- `build.js`: 로컬 FFmpeg 코어 복사 → Vite 모듈 번들링 → 배포 파일 목록과 버전이 들어간 서비스 워커 생성
- `vite.config.js`: 상대 base 및 ES Worker 설정
- `tests/planner.test.js`: 용량 예산 및 정책 테스트
- `tests/browser-smoke.mjs`: 설치된 Windows Edge로 샘플 생성·WASM 압축·취소·재시작·모바일 폭·오프라인 셸 검증

배포는 하나의 HTML 진입점과 JS/CSS/Worker/WASM 자산으로 구성됩니다. 수십 MB의 WASM과 Worker를 HTML 안에 넣으면 캐싱과 모바일 메모리 비용이 커지므로 별도 정적 파일로 유지합니다. 엔진의 `prepare / encode / cancel / clean / dispose` 인터페이스를 지키면 UI와 별도로 엔진을 교체할 수 있습니다.

수정 전 `파일명_BU.확장자`로 백업하며 기존 백업은 덮어씁니다. 백업·원본·압축 결과를 Git에 넣지 마세요. `package-lock.json`을 커밋하고 의존성 변경 시 빌드와 실제 브라우저 테스트를 다시 실행하세요.

## 압축 정책

총 비트레이트 = 목표 바이트 × 0.97 × 8 ÷ 영상 길이. 음성이 있으면 기본 64kbps, 극한 모드는 32kbps를 할당합니다. 자동 모드는 최대 30FPS, 극한 모드는 최대 24FPS, 화질 우선은 원본 FPS를 선호합니다. 비트레이트 대비 픽셀 수가 크면 해상도를 낮추며 원본 해상도 유지 옵션은 이 조정을 막습니다. 화질 보장은 하지 않습니다.

libx264 2패스, yuv420p, AAC, faststart를 사용합니다. 크기 초과 시 비트레이트를 줄여 최대 3회 추가 인코딩합니다. 12kbps 미만의 비디오 예산은 거부합니다. 매우 작은 목표는 오디오 제거 또는 목표 증가가 필요합니다. 취소 시 Worker를 종료하며 파일을 다시 선택하면 새 엔진으로 실행합니다. 분석·로딩·검증에는 백분율을 표시하지 않고, 인코딩 패스에만 FFmpeg 처리 시간 기반 진행률을 표시합니다.

입력 형식 지원은 확장자가 아닌 실제 FFmpeg 코덱과 파일 상태에 달려 있습니다. ffprobe는 FPS·음성·길이·회전을 분석합니다. 브라우저가 원본 코덱을 재생하지 못해도 FFmpeg 분석은 가능할 수 있습니다.

## GitHub 블로그 배포

공개 주소: https://nas306.github.io/videocompressor/

블로그 저장소 NAS306/NAS306.github.io의 main 브랜치 루트가 기존 Pages 배포 원본입니다. 앱은 videocompressor/ 하위 경로에만 배포합니다. 모듈 소스는 _apps/videocompressor/에 보관하며 Jekyll의 기본 제외 규칙에 따라 공개 앱 자산에서 제외됩니다.

업데이트 절차:

1. 블로그 저장소를 복제한 뒤 _apps/videocompressor/에서 npm ci, npm test, npm run build를 실행합니다.
2. 생성된 dist/ 파일을 저장소 루트의 videocompressor/로 복사합니다. 기존 파일 수정 전 _BU 백업을 생성하고 백업은 커밋하지 않습니다. 더 이상 쓰이지 않는 이전 해시 자산을 정리해 새 빌드만 게시합니다.
3. _apps/videocompressor/의 소스와 videocompressor/의 정적 결과물을 함께 커밋해 main에 push합니다.
4. GitHub Actions의 기존 Pages build and deployment 완료를 확인합니다. 루트 페이지와 /videocompressor/의 로딩·새로고침·코어 로딩·실제 압축을 확인합니다.

코어 WASM은 배포 결과물에 포함됩니다. _apps/videocompressor/public/ffmpeg/는 npm 설치 후 개발·빌드 과정에서 다시 생성하므로 소스에는 넣지 않습니다. 상대 경로와 서비스 워커 scope는 /videocompressor/에 맞춰 해석됩니다. 앱 캐시 이름도 scope별로 분리합니다.

로컬 .github/workflows/deploy.yml은 앱을 독립 Pages 사이트로 게시할 때 사용하는 예시입니다. 기존 블로그 루트를 유지하는 배포에서는 이 워크플로를 블로그에 복사하지 않습니다.

## PWA와 오프라인

서비스 워커가 앱·Worker·FFmpeg 코어를 전부 캐싱한 뒤 오프라인 셸과 압축을 사용할 수 있습니다. 최초 설치에는 약 32MB 이상의 다운로드와 저장 공간이 필요합니다. 파일 캐싱이 하나라도 실패하면 오프라인 설치는 실패하며 온라인 기능은 유지됩니다. 입력 파일과 결과 Blob은 캐싱하지 않습니다. 새 빌드는 새 캐시 버전을 만들고 활성화 시 이전 앱 캐시를 삭제합니다. 새 버전 활성화에는 기존 탭 종료가 필요할 수 있습니다. 저장 공간 정리·브라우저 정책에 따른 캐시 삭제 이후에는 다시 온라인으로 접속해야 합니다. iOS 설치는 Safari 공유 메뉴의 홈 화면에 추가를 사용하세요.

## 제한과 검증 절차

단일 스레드 엔진이 기본이며 Cross-Origin Isolation 여부는 표시만 합니다. GitHub Pages에서 별도 헤더나 SharedArrayBuffer를 요구하지 않습니다. 전체 파일이 WASM 메모리로 복사되므로 모바일에서는 수십~수백 MB 영상도 실패할 수 있습니다. 500MB 입력 제한은 안전 정책이며 그 이하의 성공을 보장하지 않습니다. 브라우저가 탭을 강제 종료하는 메모리 부족은 앱이 오류를 표시할 수 없습니다. 탭을 유지하고 화면 잠금을 피하세요.

브라우저 스모크 테스트: `node tests/browser-smoke.mjs` (Windows Edge 경로는 스크립트에서 변경 가능). 외부 영상 없이 Canvas+MediaRecorder로 2초 VP8 샘플을 생성하고 실제 결과가 0.1MB 미만인지 확인합니다.

실기기 체크리스트:

- 80MB→10MB 미만, 20MB→5MB 미만의 실제 결과 바이트 확인
- 60FPS 원본→자동 모드 30FPS 이하 확인
- 음성 있음/없음, 음성 제거, 회전된 세로 영상, 손상 파일
- 극소 목표 거부, 대용량 입력 제한, 엔진 로딩 실패 후 재시도
- Android Chrome/Firefox, iOS Safari/Chrome, 데스크톱 Firefox/Safari에서 선택·취소·재시작·다운로드 또는 공유
- 실제 Pages 하위 경로에서 엔진 로딩·새로고침
- 코어 캐싱 완료 후 인터넷 차단하고 파일 선택·압축
- 새 배포 후 기존 탭 종료·재접속으로 캐시 갱신
- 저장 공간 부족·메모리 부족 상황에서 안내와 브라우저 강제 종료 한계 확인

실제 Pages, 모바일 실기기, 80MB/20MB 입력, 모든 브라우저, 강제 메모리 부족은 별도 검증 대상입니다. 모바일 성능 향상을 주장하는 최적화는 실측 후 추가하세요.

FFmpeg 사용 방식은 공식 문서 https://ffmpegwasm.netlify.app/docs/getting-started/usage/ 와 API 문서 https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/ 를 참고했습니다. 배포·상업 사용 시 포함된 FFmpeg/libx264 라이선스도 확인하세요.

## 이번 구현에서 실행한 검증

2026-10-08: npm 의존성 설치, 단위 테스트 6개, Vite 배포 빌드 성공. Windows Edge 헤드리스에서 실제 libx264 2패스 압축(0.1MB 미만), 무음 입력, 음성 입력의 AAC 인코딩, 취소 후 재시작, 320px 화면 가로 넘침 없음, 서비스 워커 캐싱 후 오프라인 새로고침·실제 인코딩·MP4 재생 메타데이터 확인을 통과했습니다. MediaRecorder 샘플의 FPS가 신뢰할 수 없는 경우 미확인으로 표시하고 30FPS를 사용합니다. 실기기 모바일 및 실제 Pages 배포는 미검증입니다.
