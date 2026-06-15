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

## 로컬 스크립트

| 명령어 | 설명 |
| --- | --- |
| `npm run productMasters:scrape` | GNB 대상 전체 ProductMaster 수집/저장 |
| `npm run product:scrape -- <productNo>` | 단일 Product 수집/저장 |
| `npm run product:scrape-range -- <startNo> [count]` | productNo 범위 순차 수집 (기본 1000개) |
| `npm run generate-ep:productMasters` | DB의 ProductMaster 기준 EP를 `dist/`에 생성 |
| `npm run generate-ep:products` | 오늘 이후 출발 Product 기준 EP를 `dist/`에 생성 |
| `npm run backfill:ep-titles` | 저장된 `epData.title`을 현재 정제 규칙으로 재계산 |

## 데일리 자동 배치

- Vercel Cron으로 ProductMaster 스크래핑을 5개 배치로 나눠 실행하고, `finalize`에서만 당일 갱신분 EP 생성·FTP 업로드.
- `vercel.json` 스케줄은 UTC 기준(`23:00 KST = 14:00 UTC`부터 5분 간격).
- 엔드포인트는 `api/cron`의 `daily-scrape-1..5`, `daily-finalize`. 모두 `Authorization: Bearer <CRON_SECRET>` 필요.
