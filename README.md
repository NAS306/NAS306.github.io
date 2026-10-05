# Formation Breaker

진형과 전술 아이템을 활용하는 브라우저 기반 2D 탑뷰 슈팅 게임입니다. 전선전, 공성전 공격·방어, 돌파전 시나리오를 제공합니다.

**[게임 실행](https://nas306.github.io/)** · **[한국어 게임 안내](PR_kr.md)** · **[English guide](PR_en.md)**

## 실행

웹 버전에서 바로 실행하거나 저장소를 복제해 정적 HTTP 서버로 실행합니다. Python 3가 설치되어 있다면 저장소 폴더에서 다음 명령을 사용할 수 있습니다.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

`http://127.0.0.1:8000`을 엽니다. JavaScript ES 모듈과 레벨 JSON 로딩을 사용하므로 `file://`로 직접 여는 대신 HTTP 서버를 사용하세요. 별도의 빌드나 npm 설치는 없습니다.

## 기본 조작

| 입력 | 동작 |
| --- | --- |
| WASD / 마우스 / 좌클릭 | 이동 / 조준 / 발사 |
| Q | 무기 전환 |
| 1·2 / 우클릭 | 전술 아이템 선택 / 배치 |
| Space + 마우스 휠 | 자유 카메라 |
| 시작 화면의 1~4 | 시나리오 선택 |

모바일은 데스크톱 플레이와 다르게 관전 및 터치 상호작용을 중심으로 동작합니다. 자세한 규칙과 제한은 위 게임 안내 문서를 참고하세요.

## 파일 구성

| 파일·폴더 | 역할 |
| --- | --- |
| [index.html](index.html) | 시작 화면, HUD와 스타일 |
| [game.js](game.js) | 게임 진입점과 진행 제어 |
| [entities.js](entities.js) | 게임 개체 |
| [systems.js](systems.js) | 전투·이동 등 게임 시스템 |
| [runtime.js](runtime.js), [math.js](math.js) | 런타임 공유 값과 계산 보조 함수 |
| [level-config.js](level-config.js), [levels/levels.json](levels/levels.json) | 레벨 로딩과 시나리오 데이터 |
| [weapon-config.js](weapon-config.js) | 무기 설정 |
| [mobile-support.js](mobile-support.js) | 모바일 환경 지원 |
| [assets/](assets/) | 사운드·스프라이트 |
| [_config.yml](_config.yml) | GitHub Pages 설정 |

## 유지보수와 확인

기존 파일은 수정 전에 `파일명_BU.확장자`로 백업합니다. 밸런스 변경은 가능한 한 레벨·무기 설정에서 처리하고 동작 변경 시 관련 게임 안내도 함께 갱신하세요.

현재 자동 테스트는 없습니다. 변경 후에는 네 시나리오의 시작·종료, 이동·발사·무기 전환, 전술 아이템, 오디오와 모바일 화면을 확인하세요. 사운드·이미지는 실행 자산이므로 문서 정리 과정에서 삭제하지 않습니다.
