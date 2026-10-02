# ire-ep

모두투어 상품을 수집해 MongoDB에 저장하고, 네이버 EP TSV를 생성해 FTP로 업로드하는 서비스.

- **ProductMaster**: 카탈로그(마스터) 단위. 지역/테마 검색으로 수집하며 데일리 크론 배치 대상.
- **Product**: 출발일 단위 개별 상품. `productNo`로 상세를 수집하며 로컬 스크립트로 운영.

## 환경변수

`config/env.js`가 단일 진입점이며 `NODE_ENV`에 따라 파일을 읽는다.

- 로컬(기본): `.env.local`
- 프로덕션(`NODE_ENV=production`) 및 Vercel 주입: `.env` / 주입값

```bash
cp .env.example .env.local   # 값 채우기
npm run dev                  # 헬스체크 서버 (GET /, /health)
```

### EP 파일명

최종 EP 산출물 이름은 코드에 박아두지 않고 env로 정한다.
배치·업로드 스크립트·대시보드가 모두 `EP_FILENAME`을 쓴다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `EP_FILENAME` | `ire_naver_ep.txt` | 병합 결과이자 FTP `/www/ep`에 올라가는 최종 파일명 |

## 로컬 스크립트

| 명령어 | 설명 |
| --- | --- |
| `npm run scrape:productMasters:<env>` | GNB 대상 전체 ProductMaster 수집/저장 |
| `npm run scrape:products:<env> -- <productNo>` | 단일 Product 수집/저장 |
| `npm run scrape:products-range:<env> -- <startNo> [count]` | productNo 범위 순차 수집 (기본 1000개) |
| `npm run ep:productMasters:<env>` | DB의 ProductMaster 기준 EP를 `dist/`에 생성 |
| `npm run ep:products:<env>` | 오늘 이후 출발 Product 기준 EP를 `dist/`에 생성 |
| `npm run ep:packages:<env>` | Package 기준 EP를 `dist/`에 생성 |
| `npm run ep:<env>` | 생성된 EP 파일들을 legacy 헤더 기준 하나로 병합 |
| `npm run refresh:products:<env> -- [limit] [concurrency]` | `verifiedAt` 오래된 순으로 저장된 Product 재검증 |
| `npm run backfill:ep-titles` | 저장된 `epData.title`을 현재 정제 규칙으로 재계산 |

EP 명령어는 `:dev`/`:prd` 접미사로 대상 환경을 정한다.
`NODE_ENV=production` 여부로 `config/env.js`가 읽을 dotenv 파일이 갈린다.

```bash
npm run ep:productMasters:dev   # .env.local (로컬)
npm run ep:productMasters:prd   # .env       (프로덕션)
```

## 데이터 수집 정책

수집 단계에서 걸러낸 상품은 DB에 저장하지 않는다. 한 번 저장되면 EP까지 그대로 흘러가므로,
판매할 수 없는 상품은 저장 이전에 차단하는 것을 원칙으로 한다.

### Product (출발일 단위)

`GetProductDetailInfo`로 `productNo` 단건을 조회한다.

**제외 조건 1 — 판매 종료/취소.** 상세 응답에서 아래 셋 중 **하나라도 `"Y"`면 수집하지 않는다.**

| 필드 | 의미 |
| --- | --- |
| `salesEnd` | 판매 종료 |
| `salesEndTravelPlanner` | 여행플래너 판매 종료 |
| `cancel` | 취소된 상품 |

**제외 조건 2 — 출발일 경과.** `departureDate`가 **오늘보다 이전이면 수집하지 않는다.**
자정 기준으로 비교하므로 오늘 출발하는 상품은 아직 유효하다.
`departureDate`가 비어 있거나 날짜로 해석되지 않는 값은 판단 불가로 보고 걸러내지 않는다.

두 판정 모두 이미지 FTP 업로드 **이전**에 수행한다. 대상이 아닌 상품 때문에 이미지를 올리는
낭비를 막고, 업로드 중 발생하는 오류가 판정 결과를 흐리지 않게 하기 위함이다.

수집 결과 상태값은 다음과 같다.

| 상태 | 조건 | 저장 |
| --- | --- | --- |
| `created` / `updated` | 판매 중인 상품 | O |
| `soldout` | 판매 종료/취소 플래그 중 하나라도 `Y` | X |
| `departed` | 출발일이 오늘보다 이전 | X |
| `skipped` | 상세 API가 404이거나 `isOK: false` | X |
| `failed` | 그 외 오류(상품명 누락, 이미지 다운로드 실패 등) | X |

`soldout`은 `soldoutFlags`, `departed`는 `departureDate`, `skipped`/`failed`는 에러 메시지로
사유가 함께 출력된다. 사유 없이 건너뛰면 정상 상품이 유실돼도 로그만으로는 구분할 수 없다.

EP 생성 시에도 **출발일이 오늘 이후인 상품만** 포함한다. 수집·재검증 단계와 중복되는 의도된
이중화다 (→ [출발일 필터는 세 단계에 걸친다](#출발일-필터는-세-단계에-걸친다)).

### ProductMaster (카탈로그 단위)

`GetGnb` 트리에서 수집 대상을 뽑고, 대상별로 `SearchProductMaster`를 페이지 단위로 조회한다.

**수집 대상 선정**

- **지역**: `areaKeywords[].areaKeywordNo`. 단, 지정된 상위 경로에 속하고 하위 카테고리를 가진 노드만.
- **테마**: 국내여행 경로 아래의 `themeNo`.
- `areaNo` / `themeNo` 기준으로 중복 제거하며, 수집 중에는 `masterCode`로 한 번 더 중복을 거른다.

**제외 조건** — Product와 달리 판매 상태 필터가 없다. 목록 API 응답에 `salesEnd`,
`salesEndTravelPlanner`, `cancel` 필드 자체가 내려오지 않기 때문이다. 대신 노출 기간
(`exposureStartDate` / `exposureEndDate`)과 `reservationSeat`를 제공하므로, 필터가 필요해지면
이 값들을 기준으로 삼는다.

**갱신 방식** — 이미 저장된 `masterCode`는 `updated_at`만 갱신하고 `epData`는 다시 만들지 않는다.
데일리 배치가 당일 갱신분만 EP로 내보내기 때문에, 재방문한 마스터도 EP 대상에 포함시키려는 의도다.
따라서 가격이나 제목이 바뀌어도 기존 `epData`에는 반영되지 않는다.

## 재검증과 삭제 정책

`npm run refresh:products:<env>`는 `verifiedAt` 오래된 순으로 Product를 상세 API로 다시 조회한다.
삭제 사유는 두 갈래이고, **둘 다 지우지만 changeLogs에 남는 것은 한쪽뿐이다.**

| 사유 | 조건 | changeLogs | 왜 |
| --- | --- | --- | --- |
| 판매 불가 (`DROP_RULES`) | `salesEnd` / `salesEndTravelPlanner` / `cancel` 중 하나라도 `"Y"` | O | 데이터가 바뀐 것이고 되돌아오지 않는다 |
| 보관 만료 (`EXPIRE_RULES`) | `departureDate`가 오늘보다 이전 | X | 바뀐 건 상품이 아니라 오늘 날짜뿐이다 |

출발일 경과를 이력에 남기면 "바뀐 것"과 "때가 된 것"이 섞여 로그가 신호를 잃는다. 그래도 지우는
이유는, 보관해도 EP에는 안 나가면서 재검증 대상으로는 영원히 잡혀 API 호출만 쓰기 때문이다.
콘솔에는 둘 다 `[DELETED]`로 찍히고 `note`로 사유가 갈린다. 요약 카운트는 합쳐서 센다.

### 출발일 필터는 세 단계에 걸친다

의도된 중복이다. 한쪽을 지우면 안 된다.

| 단계 | 하는 일 | 없으면 |
| --- | --- | --- |
| 수집 (`scrapeProduct`) | 애초에 저장하지 않는다 | 이미지 FTP 비용만 쓰고 EP엔 안 나간다 |
| 재검증 (`EXPIRE_RULES`) | 지난 상품을 지운다 | 재검증 대상이 무한히 쌓인다 |
| EP 생성 (`futureOnly`) | 남은 건을 출력에서 뺀다 | 재검증이 아직 못 돈 상품이 EP로 새어 나간다 |

재검증은 `limit`개씩만 돌아 전수 조사가 아니다. 어제 통과한 상품이 오늘 출발일을 넘겨도 순번이
돌아오기 전엔 DB에 남으므로, **EP 생성 필터가 그 시차를 메운다.**

판매 불가에는 이 이중화가 없다. 상세 API를 호출해야만 알 수 있어 EP 생성 단계에서 값싸게 재확인할
방법이 없다. 즉 판매 종료 상품의 EP 노출을 막는 것은 재검증 주기에만 달려 있다.

### changeLogs 기록 규칙

쿼리 조건인 `action`은 영어(`updated` / `deleted`), 사람이 읽는 설명은 `note`가 한글로 맡는다.
`createdAt` 기준 90일 TTL.

- 값이 그대로인 건은 기록하지 않는다. 전부 남기면 로그가 신호를 잃는다.
- 삭제 사유는 판매 종료와 취소를 구분하고, 원본 플래그를 괄호에 남긴다.
  예) `취소 (cancel)`, `판매 종료, 취소 (salesEnd, cancel)`
- 추적 키는 `documentId`가 아니라 `refKey`(`productNo` / `masterCode`)다.
  문서가 삭제되면 `documentId`는 가리킬 대상이 없어진다.

## 자동 배치 (Vercel Cron)

스케줄은 UTC 기준, 모든 엔드포인트가 `Authorization: Bearer <CRON_SECRET>`을 요구한다.
Hobby 플랜이라 크론 하나는 하루 1회까지이고 실행 시각에 ±59분 오차가 있다.
함수 한도는 300초(`maxDuration`)이며 각 작업은 그 안에서 스스로 멈춘다.

| 엔드포인트 | 스케줄 | 하는 일 |
| --- | --- | --- |
| `api/cron/collect-product` | 매시 :00 / :20 / :40 | 신규 Product 수집 + EP 생성·FTP 업로드 |
| `api/cron/collect-product-master` | 14:00~14:20 (5분 간격) | ProductMaster를 5조각으로 나눠 수집 |
| `api/cron/refresh-product` | 2시간 간격 :30 (10회/일) | Product 재검증 1,000개(동시 10) + EP 생성·FTP 업로드 |

재검증 크론은 구간을 선점하지 않는다. 수집 크론과 달리 집을 번호가 없고, 그때그때
`verifiedAt` 오래된 순으로 집으면 순서가 흔들려도 결과가 같다(±59분 오차에 영향받지 않는 이유).
겹침은 직전 실행 10분 쿨다운(`REFRESH_COOLDOWN_MS`)으로 거른다. 잠금이 아니므로 뚫릴 수 있지만
손해는 같은 1,000건에 API를 두 번 쓰는 것뿐이다.

정렬에는 `{ verifiedAt: 1, updatedAt: 1 }` 복합 인덱스가 필요하다. 없으면 매 실행이 컬렉션
전체를 훑고 메모리에서 정렬한다. 반영은 `node scripts/setupDb.js products`.
