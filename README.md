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

EP 생성 시에도 **출발일이 오늘 이후인 상품만** 포함한다. 수집 시점 이후에 출발일이 지나버린
상품이 DB에 남아 있을 수 있으므로, 수집 단계 필터와 별개로 생성 단계에서 한 번 더 거른다.

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

## 데일리 자동 배치

- Vercel Cron으로 ProductMaster 스크래핑을 5개 배치로 나눠 실행하고, `finalize`에서만 당일 갱신분 EP 생성·FTP 업로드.
- `vercel.json` 스케줄은 UTC 기준(`23:00 KST = 14:00 UTC`부터 5분 간격).
- 엔드포인트는 `api/cron`의 `daily-scrape-1..5`, `daily-finalize`. 모두 `Authorization: Bearer <CRON_SECRET>` 필요.
