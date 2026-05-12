# ire-ep

모두투어 상품 데이터를 수집하고 MongoDB에 저장한 뒤, 네이버 EP TSV 파일을 생성하고 FTP로 업로드하는 Fastify 기반 서비스입니다.

## 기능

- 상품 단건/범위/최신 번호 스크래핑
- 지역별 `ProductMaster` 수집 및 저장
- DB 또는 API 기준 네이버 EP TSV 생성
- 상품 이미지 FTP 동기화
- EP 파일 FTP 업로드

## 기술 스택

- Node.js
- Fastify
- Mongoose
- Axios
- basic-ftp

## 실행 방법

1. 의존성 설치

```bash
npm install
```

2. 환경변수 준비

```bash
cp .env.example .env
```

`.env`에 MongoDB, FTP, 모두투어 API 값을 채워주세요.

3. 서버 실행

```bash
npm run dev
```

기본 포트는 `3000`입니다.

## 주요 환경변수

- `MONGODB_URI`
- `MONGODB_DB`
- `PORT`
- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_BASE_URL`
- `MODETOUR_API_KEY`
- `MODETOUR_WEBSITE_NO`
- `MODETOUR_COMPANY_NO`
- `MODETOUR_DEVICE_TYPE`

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

## 현재 구조

```text
index.js
routes/
  ep.js
  products.js
services/
  scraperService.js
  epService.js
  ftpService.js
models/
  Product.js
  ProductMaster.js
config/
  apiConfig.js
  env.js
```

## 운영 메모

- 대량 스크래핑은 요청 한 번에 오래 걸릴 수 있습니다.
- 민감한 업로드/삭제 API는 운영 환경에서 인증 계층을 두는 것이 안전합니다.
- 생성된 EP 결과물은 저장소에 커밋하지 않도록 관리하는 것이 좋습니다.

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
