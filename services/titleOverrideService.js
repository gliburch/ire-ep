const axios = require("axios");
const { EP_OVERRIDE_SHEET_URL } = require("../config/env");

// 구글 스프레드시트(웹에 게시 → TSV)에서 id별 제목 덮어쓰기 목록을 읽는다.
// DB의 epData.title은 그대로 두고 EP 생성 시점에만 얹는 오버레이라,
// 시트에서 행을 지우면 자동 생성 제목으로 되돌아간다.
const REQUEST_TIMEOUT = 20000;

// EP 한 번 생성하는 동안 여러 번 조회하지 않도록 캐시한다.
let cachedOverrides = null;

/**
 * 시트 TSV를 id -> title Map으로 변환한다.
 * - 첫 행은 헤더이며 id/title 열 위치는 헤더 이름으로 찾는다
 * - id나 title이 빈 행은 건너뛴다
 * - 같은 id가 여러 번 나오면 마지막 행을 쓴다
 */
function parseTitleOverrideTsv(tsv) {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim() !== "");
  const overrides = new Map();

  if (lines.length === 0) {
    return overrides;
  }

  const headers = lines[0].split("\t").map((header) => header.trim().toLowerCase());
  const idIndex = headers.indexOf("id");
  const titleIndex = headers.indexOf("title");

  if (idIndex === -1 || titleIndex === -1) {
    throw new Error(`제목 덮어쓰기 시트에 id/title 헤더가 없습니다: ${headers.join(", ")}`);
  }

  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const id = (cells[idIndex] ?? "").trim();
    const title = (cells[titleIndex] ?? "").trim();

    if (!id || !title) continue;
    overrides.set(id, title);
  }

  return overrides;
}

/**
 * 제목 덮어쓰기 목록 조회 (프로세스 내 1회 조회 후 캐시)
 * @returns {Promise<Map<string, string>>}
 */
async function getTitleOverrides() {
  if (cachedOverrides) {
    return cachedOverrides;
  }

  const response = await axios.get(EP_OVERRIDE_SHEET_URL, {
    responseType: "text",
    timeout: REQUEST_TIMEOUT,
  });

  cachedOverrides = parseTitleOverrideTsv(String(response.data));
  return cachedOverrides;
}

function resetTitleOverrideCache() {
  cachedOverrides = null;
}

module.exports = {
  parseTitleOverrideTsv,
  getTitleOverrides,
  resetTitleOverrideCache,
};
