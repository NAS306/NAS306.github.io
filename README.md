# Tank Battle / Formation Breaker

## 실행과 검사

최종 사용자는 `dist/app.html` 파일 하나를 브라우저에서 직접 열면 됩니다. 이미지·오디오·맵 데이터·스타일·JavaScript를 모두 포함하므로 서버·Node.js·인터넷 연결이 필요하지 않습니다. 배포 HTML은 직접 수정하지 않습니다.

게시 주소는 https://nas306.github.io/ 이며 `NAS306/NAS306.github.io` 저장소의 `main` 브랜치 루트 `index.html`을 GitHub Pages로 제공합니다. 게시 시 `node build.js`로 만든 `dist/app.html`을 루트 `index.html`로 복사하고, 원본 `src/`·빌드 설정·검증 스크립트도 함께 갱신합니다. 루트 `index.html` 역시 생성물이며 직접 수정하지 않습니다. 백업(`*_BU.*`, `*_BU`), `node_modules/`, `.qa/`, `.publish/`, 중간 산출물 `dist/`는 Git 업로드에서 제외합니다. 기존 개별 배포 스크립트·외부 자산·맵은 단일 HTML에 통합되어 게시 시 별도로 필요하지 않습니다.

개발 환경은 Node.js 22 이상을 사용합니다. 최초에 `npm.cmd ci`로 고정 버전 개발 의존성을 설치합니다. `node build.js` 또는 `npm.cmd run build`로 단일 HTML을 생성하고, `npm.cmd run check`로 빌드·소스 문법·Node 회귀 검사를 실행합니다. `npm.cmd run test:browser`는 설치된 Microsoft Edge를 headless로 열어 오프라인 실행·5개 모드 진입·1라운드 즉시 시작·결과 유지·수동 복귀·모바일 배치를 검사하고 `.qa/`에 화면을 저장합니다.

원본은 `src/`에서 역할별로 관리합니다. `src/js/`의 `00`~`99` 모듈, `src/styles/`의 CSS, `src/html/body.html`을 `src/index.template.html`에 통합합니다. `build.js`의 `JS_MODULES`와 `CSS_FILES`가 명시적인 결합 순서를 정하며 새 모듈을 만들면 이 목록도 갱신해야 합니다. esbuild가 ES 모듈 의존성을 확인해 하나의 IIFE로 묶고, `src/js/99-api.js`에서 공개한 API만 `window.TankGame` 네임스페이스로 노출합니다. 자산 경로 `./assets/...`는 빌드 때 `src/assets/`의 파일을 data URL로 변환하며 맵 JSON도 번들에 포함합니다. 결과는 약 14 MB이며 CDN이나 런타임 fetch에 의존하지 않습니다.

빌드 검증 후 임시 파일을 `dist/app.html`로 교체합니다. 기존 산출물이 있으면 `dist/app_BU.html`로 백업합니다. 이전 루트의 `*_BU` 파일과 테스트 백업은 빌드에 포함하지 않습니다.

## 모듈

| 파일 | 역할 |
| --- | --- |
| `src/index.template.html`, `src/html/body.html` | 단일 HTML 골격·본문·모드 카드 삽입 위치 |
| `build.js` | 명시적인 소스 순서·번들링·자산 포함·단일 HTML 생성 |
| `src/js/80-mode-cards.js`, `src/styles/mode-select.css` | 실제 게임의 도형 탱크·사각 거점으로 그린 SVG 카드와 반응형 선택 화면 |
| `src/js/90-game.js` | 기존 게임 실행, 입력, UI, 신규 모드 진입 |
| `src/js/12-game-flow.js` | 자산 재로딩 없는 수동 모드 선택 복귀 콜백 |
| `src/js/30-entities.js` | 탱크·탄환·폭발·피격 깜빡임, 기본값 1인 공격/공격속도 배율 및 방어력 |
| `src/js/31-systems.js` | 기존 전투 월드, 충돌, AI, 오디오, 객체 풀; 실제 체력 감소량 및 격파 인정 후 모드별 반응 훅 |
| `src/js/10-weapon-config.js` | 무기 기본값, 무기 순환 순서, 실제 발사와 미리보기에서 공유하는 강화 적용 계산 |
| `src/js/11-level-config.js`, `src/data/levels.json` | 기존 팀전 모드 및 맵 설정 |
| `src/js/00-math.js`, `src/js/01-runtime.js`, `src/js/02-mobile-support.js` | 공통 수학·런타임·모바일 보조 |
| `src/js/42-rogue-state.js` | 독립적인 30라운드 생존 규칙, 적 비율, 강화 비용, 포인트 수입·상한 및 상태 전이 |
| `src/js/40-rogue-balance.js` | 로그라이트 기본 능력치·무기·폭발 반경 상한·피해 감쇠, 라운드별 적 생성·성장; 팀전 수치와 분리 |
| `src/js/43-rogue-effects.js` | 발사·피격·격파 화면 흔들림, 피격 가장자리 반응, 라운드 시간에 동기화된 마지막 5초 경고 계산 |
| `src/js/21-rogue-dice.js` | 적 강화 결과 7종·균등 추첨·회당 +20~60%p 정수 강화·전 스탯 강화 Bomb, 누적 강화량 초기화 및 카드 타임라인 |
| `src/js/45-rogue-projectiles.js` | 로그라이트 외곽 벽 도탄 경로·모서리 반사·횟수 소진 처리 |
| `src/js/44-rogue-transition.js` | 1.5초 종료 연출의 시간 감속·VICTORY/LOST 이동·패널 진입과 프레임 속도에 독립적인 이동량 계산 |
| `src/js/41-rogue-abilities.js` | 능력 30종의 설명·SVG 아이콘·효과, 폭발 원천에 따른 후보, 누적 스탯 및 변경 스탯 미리보기 |
| `src/js/20-rogue-ammo.js` | 시작 탄약·300발 보급·라운드별 탄약 구매량·폭발탄 비용과 실제 발사량 |
| `src/js/22-rogue-stats.js` | 실행별 누적 전투 통계, 실제 회복량, 최종 결과 6개 지표와 킬당 탄 소모량 |
| `src/js/50-rogue-world.js` | 공통 충돌/엔티티를 재사용하는 정사각형 경기장, 적 생성 및 솔로 AI |
| `src/js/51-rogue-history.js` | 라운드 종료별 전투 통계 차분·실제 탱크 수치 스냅샷과 그래프 좌표 계산 |
| `src/js/77-rogue-guide.js`, `src/styles/rogue-guide.css` | 모드 카드 상단·강화 화면에서 공유하는 영문 모드 안내와 접근 가능한 대화창 |
| `src/js/78-rogue-ability-ui.js` | 등급 표시·선택 카드·보유 능력·재조정 대상 선택 |
| `src/js/79-rogue-charts.js` | 6개 정규화 추세선·범례 토글, 실제 수치 표, 라운드별 강화·능력 툴팁 |
| `src/js/81-rogue-game.js` | 로그라이트 실행 루프, 좌표 변환, HUD, 라운드 준비 및 결과 화면 |
| `src/styles/rogue.css` | 로그라이트 전용 UI 스타일 |
| `tests/rogue.test.js` | 생존 진행·강화·무기·보상·월드 회귀 검사 |
| `tests/rogue-projectiles.test.js` | 네 방향·모서리·고속 도탄, 반사 경로 충돌, 크기·탄속 중첩, 폭발탄·풀 재사용·기존 모드 보존 검증 |
| `tests/rogue-progression.test.js` | 30라운드·선택 생략·등급 확률·재조정·경제 능력·방어막·음악 종료 검증 |
| `tests/rogue-abilities.test.js` | 능력 선택·누적·미리보기, 실제 탄환·회복 효과, 원래 배율의 맵과 카메라 검사 |
| `tests/rogue-economy-guide.test.js` | 탄약 가격 경계·실제 구매·배당 100/상한 5,000·영문 안내·독립된 카드 안내 버튼 |
| `tests/rogue-ammo.test.js` | 최초·라운드 보급 300발·중복 방지·무제한 구매·실제 탄환별 차감·부분 사격·고갈·폭발탄·HUD 및 구매 잠금 검사 |
| `tests/rogue-stats.test.js` | 실제 피해·회복·탄 소모, 승패 6개 통계, 가중된 전체 킬당 탄 소모량과 0킬 처리 |
| `tests/rogue-history.test.js` | 라운드별 통계 합산·실패 기록·강화/능력 스냅샷 독립성, 정규화·0킬 공백·재조정 툴팁 검사 |
| `tests/rogue-explosions.test.js` | 과도한 중첩의 실제 폭발 반경 상한·미리보기, 거리별 피해·범위 밖 연쇄 차단·치명적인 역효과·기존 폭발 보존 검사 |
| `tests/rogue-balance.test.js` | 실제 이동·지속 사격·3발 격파·폭발의 집단 피해와 거리별 차이·적 성장·생성 빈도와 팀전 수치 보존 검사 |
| `tests/rogue-health.test.js` | 피격·최대 체력 증가·수리·사망 시 전투/준비 체력바와 숫자·접근성 안내·위험 색상 동기화 검사 |
| `tests/rogue-effects.test.js` | 마지막 5초의 매초 점멸·확대·색상 변화, 전투 이벤트 연결, 흔들림 감쇠·상한·조준 좌표 보존·라운드 간 초기화 검사 |
| `tests/rogue-combos.test.js` | 능력 30종의 이점·명시된 역효과·추첨, 다중 탄환·장수명·관통 조합, 음수 방어력, 연쇄 폭발의 보상·회복·중복 방지 검사 |
| `tests/rogue-round-flow.test.js` | 자동 주사위·누적 강화·입력 차단·중간/최종 종료 문구·슬로우모션·결과 무기한 유지·첫 라운드 전투 진입 검사 |
| `tests/build.test.js`, `scripts/browser-check.js` | 단일 파일·의존성 순서·인게임 도형 카드·오프라인 브라우저 실행·첫 패배 결과·수동 복귀 검사 |
| `tests/session-flow.test.js` | 모든 모드 반복 전환 시 자산 재사용·음악 타이머·입력 이벤트·프레임 정리 및 화면 맞춤 검사 |

## 로그라이트 규칙

- 총 30라운드, 라운드당 40초입니다. 1라운드는 체력 125·탄약 300으로 즉시 전투를 시작합니다. 2~30라운드 시작 전에는 업그레이드·선택 능력·적 강화 주사위가 있으며, 체력과 강화는 유지하고 탄약 300발을 보급합니다. 30라운드 생존 시 VICTORY, 사망 시 LOST입니다.
- 준비 순서는 능력 선택(생략 가능) → 업그레이드/탄약 구매 → 다음 라운드 → 적 주사위 확인 → 전투입니다. 능력을 고르지 않아도 다음 라운드로 진행합니다. 주사위를 굴린 뒤에는 능력·재조정·구매를 잠급니다. 1.5초 종료 연출 중에는 전투 결과를 고정하고 추가 피해·포인트·회복을 발생시키지 않습니다. 최종 결과는 Mode Select를 누를 때까지 유지합니다. 승리·패배 모두 종료 판정 즉시 배경 음악을 멈추고, 중간 라운드 음악은 유지합니다.
- 조작은 WASD/방향키 이동, 마우스 조준, 좌클릭 사격입니다. 플레이어는 일반포를 사용하고 Q 교체는 없습니다. 일반포는 피해 40, 재장전 0.2초, 탄속 750, 수명 1.5초입니다. 정사각형 경기장은 화면 폭과 같고 세로 카메라가 플레이어를 따라갑니다. 모바일 직접 조작은 제공하지 않습니다.
- 적은 1라운드 6대부터 매 라운드 6대씩 증가해 30라운드에는 최대 180대입니다. 보충 간격은 0.3초에서 0.06초로 감소합니다. 적 체력은 `90 + 3 × (라운드 - 1)`, 팀전 대비 공격력 배율은 `0.5 × (1 + 0.02 × (라운드 - 1))`입니다. 이동속도·공격속도는 팀전 기본의 절반입니다. 첫 10라운드 무기 조합은 유지하고 이후에는 마지막 세 조합을 순환합니다. 실제 설정은 `40-rogue-balance.js`와 `42-rogue-state.js`가 담당합니다.
- 격파당 기본 4포인트입니다. 포인트 강화는 구매마다 기본 이동속도·공격력·공격속도 +3%p, 방어력 +2이며, 비용은 `5 + 해당 항목 구매 횟수 × 2`입니다. Repair는 전량 회복하며 구매 횟수마다 비용이 증가합니다. 탄약 구매량은 `max(1, 21 - 라운드)`발/포인트입니다. 1라운드 기준 20발, 2라운드 19발, 10라운드 11발, 20~30라운드 1발이며 실제 구매는 준비 화면이 있는 2라운드부터 가능합니다. 일반탄은 1발, 추가 폭발탄은 10발을 소비하며 탄약이 부족하면 가능한 발수만 발사합니다. 최대 체력 증가나 재조정은 현재 체력을 자동 회복시키지 않습니다.

### 능력과 등급

- 각 준비 화면에 서로 다른 카드 3장을 제시하며 1장 선택 또는 전부 생략할 수 있습니다. **각 카드 슬롯마다** 등급을 Common 60% / Rare 30% / Legendary 10%로 먼저 추첨하고, 해당 등급의 유효한 능력 중 균등하게 뽑습니다. 같은 제안 안에서는 중복되지 않으며 라운드 사이 중복 획득은 누적됩니다. 등급과 확률은 `41-rogue-abilities.js`에서 관리합니다.
- 폭발 범위 전용 카드는 Explosive Payload 또는 Death Cascade를 보유해야 나옵니다. 최대 레벨에 도달한 능력은 제외합니다. Oversized Rounds·Devil’s Bargain은 최대 3레벨, Pulse Shield는 최대 1레벨입니다. 각 등급에는 제한된 능력을 제외해도 3장을 제시할 수 있는 후보를 유지합니다.
- Recalibration은 보유 능력이 있을 때만 추첨하는 즉시 사용 카드입니다. 선택한 보유 능력의 레벨을 1 낮추며 1레벨이면 제거합니다. 혜택과 불이익을 모두 다시 계산하고 일반적인 상·하한을 적용합니다. 현재 체력은 새 최대 체력 이하로 제한하지만 자동 회복·부활하지 않습니다. 대상을 고르기 전 취소하거나 다음 라운드로 넘어갈 수 있습니다. 카드 자체는 보유 목록에 쌓이지 않습니다.
- Oversized Rounds는 획득마다 탄환 크기·충돌 반경 ×2, 현재 탄속 ×0.7입니다. 일반탄·추가 폭발탄에 적용하며 피해와 폭발 반경은 바꾸지 않습니다. 최대 3레벨에서 크기 ×8, 탄속 ×0.343입니다. 기존의 피해 절반 효과는 제거했습니다.
- Devil’s Bargain은 획득마다 모든 획득 포인트 ×2, 방어력 적용 후 실제 받는 피해 ×2입니다. Round Dividend는 클리어한 라운드 번호 ×100포인트를 레벨당 한 번 지급하고 모든 포인트 수입에 5,000 보유 상한을 적용합니다. 두 능력을 함께 얻으면 라운드 보상에도 배수가 적용됩니다. 통계에는 상한 때문에 버려진 금액을 제외하고 실제 받은 포인트만 더합니다. 상한 능력을 제거해도 이전에 버려진 포인트는 반환하지 않습니다.
- Pulse Shield는 매 라운드 전투 시작 후 3초에 첫 발동하며 [3,4), [6,7)…초 동안 직접·폭발 피해를 모두 막습니다. 전투 시뮬레이션 시간만 사용하고 준비·종료 연출·비활성 탭에서는 진행하지 않습니다. 라운드 시작 시 시계를 초기화하고 제거 즉시 효과를 해제합니다. 방어막은 탱크 주변의 청록색 링으로 표시합니다.
- 기존 능력과 포인트 강화의 백분율은 기본값 기준으로 합산합니다. 대형 탄환의 크기·탄속과 거래 능력의 포인트·피해 배수만 획득마다 곱합니다. 최대 체력은 25, 기본 공격력·탄속 배율은 20%, 이동속도·공격속도는 25% 아래로 내려가지 않습니다. 대형 탄환의 탄속 감소는 탄속 하한을 계산한 뒤 적용합니다. 음수 방어력은 절댓값만큼 매 피격 피해를 추가합니다.
- 도탄은 외곽 경계를 사용합니다. 획득마다 반사 +1회, 모서리 동시 접촉은 1회이며 수명·관통의 명중 기록은 유지합니다. 모든 반사 경로를 구간별로 검사합니다. 반사 소진 후 다음 벽에서 소멸하고 폭발탄은 그 위치에서 폭발합니다. 종료 연출에서는 반사만 표시하고 피해는 발생시키지 않습니다.
- 추가 폭발탄은 일반탄과 별도로 발사되며 멀티샷은 일반탄 수만 늘립니다. 폭발탄의 기본 피해는 15~80, 반경 90(최대 150), Death Cascade의 기본 피해는 0~40/레벨, 반경 70(최대 110)입니다. 피해는 `최소 피해 + (최대 피해 - 최소 피해) × (1 - 거리 / 반경)²`로 줄고 적에게만 적용됩니다. 연쇄 폭발은 예약 목록을 순차 처리하며 각 격파의 포인트·회복을 한 번만 지급합니다. 기존 팀전·적 대포의 아군 피해 및 선형 감쇠는 유지합니다.

| 능력 | 등급 | 효과 |
| --- | --- | --- |
| Reinforced Hull | Common | +100 max HP, but −35% base move speed. No instant healing. |
| Turbo Engine | Common | +60% base move speed, but −35% base damage. Escaping costs stopping power. |
| Autoloader | Common | +80% base fire rate, but −35% base damage. Burns ammo much faster. |
| Overcharged Shells | Rare | +100% base damage, but −40% base fire rate. Long gaps leave you exposed. |
| Piercing Rounds | Rare | +3 standard-shell pierce, but −30% base damage. Payloads cannot pierce. |
| Split Barrel | Rare | +3 standard shells per volley, but −40% base damage. Each shell costs 1 ammo. |
| High Velocity | Rare | +100% base shell speed and +25% base damage, but −8 armor. Incoming hits hurt more. |
| Wide Blast | Rare | +35% base blast radius, but −35% base damage. Radius caps: payload 150px, nova 110px. |
| Combat Recycler | Rare | +10 HP per credited kill, but −50 max HP. Cannot revive a destroyed tank. |
| Heavy Plating | Common | +10 armor, but −40% base move speed. Surrounded tanks struggle to escape. |
| Glass Reactor | Legendary | +200% base damage, but −80 max HP. One pick leaves a base hull at 45 HP. |
| Bullet Storm | Legendary | +7 standard shells per volley, but −65% base damage. Each shell costs 1 ammo. |
| Siege Battery | Rare | +150% base damage and +20% base blast radius, but −65% base fire rate. |
| Blood Engine | Rare | +20 HP per credited kill, but −65 max HP. A base hull drops to 60 HP. |
| Rail Accelerator | Rare | +8 standard-shell pierce and +150% base shell speed, but −60% base fire rate. |
| Redline Reactor | Legendary | +200% base fire rate, but −55% base damage and −8 armor. Faster ammo drain, harder incoming hits. |
| Orbital Magazine | Rare | +2 standard shells and +200% base flight time, but −70% base shell speed. Misses arrive very late. |
| Unstable Warheads | Rare | +60% base blast radius, but −50% base damage and −35% base shell speed. Caps: shell 150px, nova 110px. |
| Iron Fortress | Legendary | +200 max HP and +12 armor, but −60% base move speed and −50% base fire rate. No healing. |
| Death Cascade | Legendary | Kills erupt for 0–40 base damage in 70px, but −12 armor. Enemy-only blast; radius capped at 110px. |
| Explosive Payload | Legendary | +1 enemy-only explosive shell per volley (10 ammo), but −40% base fire rate. Base blast 15–80 damage, 90px. |
| Ricochet Rounds | Common | +1 wall bounce per shell. Repeat picks add bounces; flight time stays the same. |
| Oversized Rounds | Rare | Shell size ×2 and shell speed ×0.7 per level. Damage unchanged. Maximum level 3. |
| Recalibration | Common | Choose an owned ability to lose one level. Its benefits and penalties are recalculated. Used immediately. |
| Devil’s Bargain | Rare | Points earned ×2, but damage taken ×2 per level. Maximum level 3. |
| Round Dividend | Legendary | Each cleared round grants round ×100 points per level. Your points are capped at 5,000. |
| Pulse Shield | Legendary | Block all damage for 1 second every 3 combat seconds. First shield at 3 seconds. Maximum level 1. |
| Light Chassis | Common | +25% base move speed, but −25 max HP. No instant healing. |
| Dense Ammunition | Rare | +80% base damage, but −25% base shell speed. |
| Overdrive Matrix | Legendary | +150% base fire rate and +75% base damage, but −35% base move speed. |

### 영문 모드 안내

- 모드 선택 카드 상단과 업그레이드 화면의 `Mode guide` 버튼으로 같은 영문 설명을 엽니다. 카드 배포 버튼과 안내 버튼은 형제 요소이며 안내를 눌러 전투가 시작되지 않습니다.
- 진행·강화·탄약 가격·능력 30종·등급·주사위·결과 통계를 안내합니다. 실제 설정과 능력 설명을 재사용해 수치 변경 시 영문 안내도 갱신됩니다.
- 네이티브 dialog의 모달 포커스·Escape 닫기와 내부 스크롤을 사용합니다. 열려 있는 동안 모드 시작 단축키와 준비 화면의 포커스 제한을 멈추고, 닫을 때 원래 버튼으로 포커스를 돌립니다. 오프라인에서도 동작합니다.

### 결과 화면과 통계

- 준비/결과 스탯은 포인트·이동속도·탄환 피해·초당 발사·방어력·일제사 탄약·탄속·탄환 크기/도탄 8행을 표시합니다. 필요한 포인트 배수·피해 배수·상한·방어막 주기는 아래 한 줄로 안내합니다. 보유 능력은 등급 색상의 아이콘·레벨과 이름/효과 툴팁으로 표시합니다.
- 최종 결과 화면의 스탯 영역은 가로 약 20%, 결과 영역은 약 80%입니다. 결과 항목은 **킬, 가한 피해, 받은 피해, 회복량, 탄 소모량, 킬당 탄 소모량** 6개이며, 합계·한 그래프·실제 라운드 수치 표를 동시에 표시합니다. 남은 체력과 획득 포인트는 결과 지표에서 제외하되 왼쪽 현재 스탯은 유지합니다. 준비 화면 배치는 그대로입니다.
- 한 그래프에 6개 추세선을 그립니다. 지표마다 자기 라운드 최고값을 100%로 정규화하고 원래 수치의 크기가 아닌 추세를 비교합니다. 색·선 패턴·범례로 구별하고 범례 버튼으로 각 선을 켜고 끌 수 있습니다. 합계, 포인트 툴팁, 라운드 표는 실제 수치입니다. 전 라운드가 0인 지표는 0%에 표시합니다.
- 전체 킬당 탄 소모량은 총 탄 소모량 ÷ 총 킬, 라운드별 값은 해당 라운드 탄 소모량 ÷ 해당 라운드 킬입니다. 라운드별 비율을 합산하거나 평균 내지 않습니다. 0킬인 경우 `—`로 표시하고 그래프에는 점·연결선을 만들지 않습니다. 회복량은 실제 회복된 HP이며 준비 중 Repair는 다음 전투 라운드에 포함됩니다.
- 라운드 표의 행과 그래프 점에 마우스를 올리면 그 라운드 전에 구매한 강화 항목·횟수·최종 레벨과 선택한 능력·레벨을 보여줍니다. 재조정은 감소시킨 대상과 감소 후 레벨/제거 여부를 표시하며 선택 생략도 구분합니다. `RogueState.startRound()`에서 불변 준비 기록을 만들기 때문에 라운드 종료 시 선택 초기화나 이후 구매가 과거 툴팁에 영향을 주지 않습니다.
- 최대 30개의 라운드 값은 표 내부 스크롤로 조회하고 그래프 축은 5라운드 단위로 표시합니다. 표는 키보드로 포커스·스크롤할 수 있으며 모든 선을 꺼도 실제 수치는 남습니다. 기록·범례 상태는 새 게임에서 초기화하고 외부 라이브러리나 저장 형식은 추가하지 않습니다.
- 게임 UI는 영어입니다. 준비/결과 패널은 1280×800을 기준으로 화면에 맞춰 축소·확대합니다. 등급·재조정 UI는 `78-rogue-ability-ui.js`, 결과 그래프는 `79-rogue-charts.js`, 화면과 루프는 `81-rogue-game.js`에서 관리합니다. 능력 미리보기는 실제 스탯 계산을 재사용하며 카드에는 최대 3개의 핵심 변경을, 툴팁에는 모든 변경을 표시합니다.

## 유지보수

기존 파일 수정 전 `파일명_BU.확장자`로 백업하며 이미 있으면 덮어씁니다. 백업 파일은 실행 진입점에서 참조하지 않습니다.
모든 모드(전선전·공성 공격·공성 방어·소모전·로그라이트 및 슈퍼/관전 플레이)는 최종 승리·패배 결과를 무기한 표시하고 Mode Select 버튼을 누를 때만 모드 선택 화면으로 돌아갑니다. 종료 카운트다운과 강제 이동은 없습니다. 로그라이트의 중간 라운드 생존은 강화 화면으로 진행합니다.
모드 복귀 시 페이지를 새로 불러오지 않습니다. 앱이 등록한 복귀 콜백에서 경기의 `dispose()`를 호출하고 입력·포인터·키보드·화면 크기 이벤트와 프레임 루프, 롱프레스 및 음악 타이머를 정리합니다. 스프라이트 캐시·오디오 풀·레벨 목록은 재사용하고 준비된 모드 선택 화면을 즉시 표시합니다. 새 경기의 체력·강화·라운드 상태는 새 게임 인스턴스에서 초기화하며, 폐기된 게임의 비동기 초기화/프레임 콜백은 재시작되지 않게 막습니다.

모드 선택 화면은 5개의 이미지 카드로 구성합니다. 일반포·스캐터·대포는 실제 게임의 원·삼각형·사각형과 동일한 팀 색상·흰 테두리·체력바로 표시하고 삼각형은 실제 렌더러의 기하 함수를 재사용합니다. BASE·Stronghold도 인게임의 사각형·색상·라벨을 사용합니다. 카드 아래에 모드 이름과 설명을 두고 1~5 단축키·키보드 선택을 유지합니다. 작은 화면은 2열과 세로 스크롤을 사용하며 모션 감소 설정에서는 장식 애니메이션을 멈춥니다. 빈 배경 클릭은 전투를 시작하지 않습니다.
