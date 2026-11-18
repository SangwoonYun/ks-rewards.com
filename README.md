# Kingshot Rewards

Kingshot 기프트 코드를 자동으로 수집·검증하고, 등록된 플레이어 계정에 대신 수령해 주는 서비스입니다.
Nuxt 4(Nitro) 단일 서버와 SQLite로 동작하며, 공개 등록 페이지와 관리자 콘솔을 함께 제공합니다.

## 주요 기능

**공개 페이지 (`/`)**
- 플레이어 ID + 왕국 번호로 자동 수령 등록 (여러 명 한 번에 등록 가능)
  - 등록 전에 Kingshot API로 ID/왕국 조합을 확인하고, 맞지 않으면 등록하지 않습니다.
  - 등록되면 받을 수 있는 코드가 우선순위 높게 큐에 들어가고 백그라운드에서 바로 수령됩니다.
- 사용 가능한/만료된 기프트 코드 목록, 최근 수령 내역, 등록자 수

**관리자 콘솔 (`/admin`)**

| 메뉴 | 내용 |
|---|---|
| Dashboard | 유저·코드·큐 통계, 최근 수령 내역 |
| Gift Codes | 코드 목록, 수동 추가/삭제, 동기화, pending 코드 검증, invalid 코드 재검증 |
| Redemptions | 수령 이력, 큐 현황(재시도·삭제), 프로필 일괄 갱신 |
| Users | 유저 검색·필터·정렬, 활성/비활성, 왕국 변경, 코드 적용, 프로필 갱신 |
| Redemption Failures | 재시도가 끝난 실패 유저 목록(왕국 불일치/계정 없음/기타), 이적한 왕국 자동 탐색 |
| Priority Queue | 우선 처리 유저 지정과 우선순위 조정 |

## 동작 방식

```
[외부 코드 API] ──(발견 주기)──▶ gift_codes: pending
                                   │  실제 유저(최대 3명)로 사용해 보고 판정
                                   ▼
                     validated / expired / invalid
                                   │  활성 유저 × validated 코드 중 아직 필요한 조합
                                   ▼
                     redemption_queue (우선순위 순)
                                   │  단일 worker가 한 건씩 원자적으로 가져가 처리
                                   ▼
                     redemptions (모든 사용 결과 기록)
```

- **발견 주기** (`NUXT_DISCOVERY_INTERVAL_MINUTES`): 코드 동기화 → pending 코드 검증(이전에 판정이 안 된 코드 포함) → validated 코드 만료 재확인(하루 1회) → 필요한 조합을 큐에 추가 → worker 시작.
- **큐 worker**: 프로세스 안에 하나만 돌며 `pending` 항목을 우선순위 순으로 한 건씩 가져갑니다(`UPDATE … RETURNING`으로 원자적 선점). 등록·관리자 작업으로 새 항목이 들어오면 바로 깨어나고, 주기(`NUXT_REDEMPTION_INTERVAL_MINUTES`)마다 한 번씩도 깨어납니다.
- **결과 처리**: 모든 수령은 `server/services/redemptionExecutor.ts` 한 곳을 거칩니다.

  | 결과 | 큐 항목 | 코드 상태 |
  |---|---|---|
  | 성공 / 이미 받음 / 조건 미달 | 삭제 | pending이면 validated |
  | 만료(`TIME_ERROR`, `USED`) / 없는 코드 | 해당 코드의 큐 전체 삭제 | expired / invalid |
  | `TOO_FREQUENT`, `TIMEOUT_RETRY`, `USER_INFO_ERROR` | 최대 3회까지 다음 실행에서 재시도, 이후 failed | 변화 없음 |
  | 그 외 실패 | failed | 변화 없음 |

- **왕국 불일치**: 마지막 결과가 `USER_INFO_ERROR`이고 그 뒤로 왕국이 확인되지 않은 조합은 자동으로 다시 큐에 넣지 않습니다. 왕국이 확인되면(등록, 관리자 변경, 왕국 탐색, 프로필 조회) 다시 큐에 들어갑니다.
- **요청 제한**: Kingshot API 요청은 전역 rate limiter(`NUXT_MIN_REQUEST_INTERVAL_MS`)로 직렬화됩니다. HTTP 429를 받으면 `Retry-After` 동안 모든 요청이 멈춥니다. 왕국 탐색은 별도 limiter(`NUXT_SEARCH_REQUEST_INTERVAL_MS`, 신호에 따라 자동 조절)를 쓰고, 동시 요청은 보내지 않습니다.
- **프로필 조회**: 닉네임·아바타·왕국을 mightpulse.com에서 가져옵니다(비공식 API). 90일 미접속 등 비활성 플레이어는 일괄 갱신 시 비활성화됩니다.
- **백업**: SQLite online backup API로 `backups/`에 주기적으로 스냅샷을 만들고 30일 지난 파일은 지웁니다.

## 디렉터리 구조

```
app/                    프론트엔드 (Nuxt)
  pages/                공개 페이지, admin/* 관리자 페이지
  composables/          usePaginatedList, usePolling, useFlash, useSelection, useDebounceFn, useAdmin …
  components/           UserAvatar, ResultBanner, BrandMark
  middleware/           admin.global.ts (관리자 세션 확인)
  plugins/              api.client.ts (관리자 API 401 → 로그인 페이지)
  utils/                format(날짜), badges(상태 배지 클래스)
server/
  api/                  HTTP 핸들러 (얇게 유지: 입력 검증 → 서비스 호출)
  clients/              외부 API: kingshot(수령/검증), rateLimiter, giftCodeSource, mightpulse, kingdomTracker
  db/                   SQLite 연결, 버전 관리 마이그레이션, 테이블별 쿼리 모듈
  domain/               redemptionStatus: 상태 분류의 단일 기준
  services/             redemptionExecutor, queueWorker, codeValidation, giftCodeDiscovery,
                        scheduler, jobs(중복 실행 방지), kingdomSearch, playerLookup, backupService
  middleware/           /api/admin/** 인증
  plugins/init.ts       기동: 설정 점검 → 마이그레이션 → 스케줄러
test/                   vitest (메모리 SQLite)
```

## 설정

설정은 Nuxt runtimeConfig로 읽으므로 **`NUXT_` 접두사가 붙은 환경 변수만** 반영됩니다. 기본값은 [nuxt.config.ts](nuxt.config.ts), 전체 목록은 [.env.example](.env.example)에 있습니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` | `admin` / (없음) | 관리자 계정. 비밀번호가 비어 있으면 로그인 불가 |
| `NUXT_ADMIN_JWT_SECRET` | (placeholder) | 관리자 세션 서명 키. 32자 이상 랜덤 문자열 |
| `NUXT_DB_PATH` | `./data/ks-rewards.db` | SQLite 파일 경로 |
| `NUXT_REDEMPTION_INTERVAL_MINUTES` | 2 | 큐 worker를 깨우는 주기 |
| `NUXT_DISCOVERY_INTERVAL_MINUTES` | 15 | 코드 발견 주기 |
| `NUXT_BACKUP_INTERVAL_HOURS` | 6 | 백업 주기 |
| `NUXT_MIN_REQUEST_INTERVAL_MS` | 3000 | Kingshot API 요청 최소 간격 |
| `NUXT_REDEEM_DELAY_MS` | 1000 | 수령/검증 사이 추가 대기 |
| `NUXT_MAX_RETRIES` / `NUXT_RETRY_DELAY_MS` | 5 / 2000 | HTTP 요청 단위 재시도 횟수와 백오프 기준 |
| `NUXT_SEARCH_REQUEST_INTERVAL_MS` | 2000 | 왕국 탐색 기본 간격 (rate-limit 신호마다 +1s, 조용하면 -1s) |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |

기동 시 점검:
- 숫자 설정이 양의 정수가 아니면 기동하지 않습니다.
- `NODE_ENV=production`에서 JWT 시크릿이 placeholder이거나 32자 미만이면, 또는 비밀번호가 placeholder(`change-me` 등)이면 기동하지 않습니다.

## 개발

Node.js 26 LTS (24.11 이상도 동작), [Bun](https://bun.sh) 1.3 이상. Docker 이미지는 `node:26-alpine` + Bun 1.4.4로 빌드합니다.

```bash
bun install
cp .env.example .env      # 관리자 계정 등 입력
bun run dev               # http://localhost:3000

bun run test              # vitest
bun run typecheck         # vue-tsc
bun run build             # .output/ 생성
```

개발 모드에서는 API 문서가 `/_scalar`, `/_openapi.json`에 열립니다(운영 빌드에서는 꺼짐).

## 배포 (Docker)

```bash
cp .env.example .env.production   # NUXT_ADMIN_PASSWORD, NUXT_ADMIN_JWT_SECRET 필수
docker compose up -d --build
docker compose logs -f
```

- 포트: 호스트 `4127` → 컨테이너 `3000`
- 볼륨: `./data`(DB), `./backups`(백업)
- 비밀 값은 커밋되지 않는 `.env.production`에만 두고, 운영 튜닝 값은 [docker-compose.yml](docker-compose.yml)의 `environment`에 있습니다(이쪽이 우선합니다).
- DB 스키마는 기동할 때 `PRAGMA user_version` 기준으로 자동 마이그레이션됩니다.

## 참고

- Kingshot 수령 API, 코드 목록 API, mightpulse.com, kingshot.net 모두 비공식/외부 서비스이며 응답 형식이나 제한이 예고 없이 바뀔 수 있습니다.
- 원본 프로젝트: [codeberg.org/ks-rewards/ks-rewards.com](https://codeberg.org/ks-rewards/ks-rewards.com) — 이 저장소는 이를 기반으로 기능과 구조를 크게 변경한 버전입니다.
