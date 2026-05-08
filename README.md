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
