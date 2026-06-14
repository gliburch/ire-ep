## 주요 엔드포인트

### 헬스체크

- `GET /`
- `GET /health`

### 상품 수집/조회

- `POST /products/scrape?productNo=123`
- `POST /products/scrape-bulk`
- `POST /products/scrape-latest?maxRetry=10`
- `POST /products/scrape-range?startNo=1&endNo=100`
- `POST /products/search`
- `POST /products/scrape-master`
- `GET /products`
- `GET /products/:productNo`
- `DELETE /products/:productNo`

### ProductMaster

- `POST /product-masters/scrape`
- `GET /product-masters`
- `GET /product-masters/:masterCode`

### EP 생성/업로드

- `GET /ep`
- `POST /ep/upload`
- `GET /ep/masters`
- `POST /ep/masters/upload?uploadImages=true`
- `GET /ep/db`
- `POST /ep/db/upload?uploadImages=true`
- `GET /ep/db/stats`
- `POST /ep/sync-images?limit=10`

## 운영 스크립트

- `npm run backfill:ep-titles`
  기존 `Product`, `ProductMaster` 문서의 `epData.title`을 현재 제목 정제 규칙으로 일괄 갱신합니다.

## ProductMaster 스크래핑 방식

1. `GetGnb` API를 호출해서 최신 메뉴 트리를 받아옵니다.
2. `GetGnb` 응답에서 스크래핑 대상 번호를 추출합니다.
3. 지역 대상은 `해외여행`, `지방출발` 경로 아래의 중간 depth `areaKeywordNo`만 사용합니다.
4. 테마 대상은 `국내여행` 경로 아래의 `themeNo`를 사용합니다.
5. 추출한 값을 `areaTargets`, `themeTargets`로 정리합니다.
6. 스크래핑 기간은 실행일 기준 `오늘 ~ 1년 후`로 설정합니다.
7. `areaTargets`를 순회하면서 `SearchProductMaster`를 `areaNo` 기준으로 호출합니다.
8. `themeTargets`를 순회하면서 `SearchProductMaster`를 `themeNo` 기준으로 호출합니다.
9. 각 대상은 페이지네이션(`pageNo`, `pageSize=100`)으로 마지막 페이지까지 조회합니다.
10. 조회된 `productMaster`는 `masterCode` 기준으로 중복 제거합니다.
11. 각 `productMaster`를 네이버 EP용 `epData`로 변환합니다.
12. 국내 상품은 `여가/생활편의 > 국내여행 > 국내패키지/기타`, `naver_category=50007253`으로 매핑합니다.
13. 해외 상품은 `여가/생활편의 > 해외여행 > 해외패키지/기타`, `naver_category=50007257`로 매핑합니다.
14. 기존 `masterCode`가 이미 DB에 있으면 기존 값은 유지하고 `updated_at`만 갱신합니다.
15. 신규 `masterCode`는 이미지를 Cafe24 FTP에 업로드한 뒤 `epData`에 FTP URL을 반영합니다.
16. 신규 상품만 `ProductMaster`로 생성합니다.
17. 전체 순회가 끝나면 `created`, `updated`, `failed` 집계를 반환합니다.

## 데일리 자동 배치

- Vercel Cron으로 배치를 여러 번 나눠 실행합니다.
- `vercel.json`의 스케줄은 UTC 기준이며, `23:00 KST = 14:00 UTC`부터 5분 간격으로 스크래핑 배치가 실행됩니다.
- 스크래핑 배치 5개가 `GetGnb` 대상의 일부씩만 처리하고, 마지막 `finalize` 배치에서만 EP 생성과 FTP 업로드를 수행합니다.
- 자동 배치는 `GetGnb -> 대상 분할 스크래핑 -> 당일 배치에서 검색된 masterCode 누적 -> finalize에서만 EP 생성 -> FTP 업로드` 순서로 실행됩니다.
- 업로드 파일명은 항상 `ire_naver_ep.txt`이며, 기존 파일을 덮어씁니다.
- 크론 호출 엔드포인트는 [api/cron](</Users/gyeonglin.kim/Projects/ire/ire-ep/api/cron>) 아래의 `daily-scrape-1..5`, `daily-finalize` 입니다.
- `CRON_SECRET`은 필수이며, 모든 크론 엔드포인트는 `Authorization: Bearer <CRON_SECRET>`로만 실행됩니다.
- 수동 실행이 필요하면 `POST /ep/daily-run?batchIndex=0` 같은 방식으로 배치 하나를 실행하고, `POST /ep/daily-run?finalize=true`로 최종 EP 업로드를 실행할 수 있습니다.
