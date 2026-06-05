const axios = require("axios");
const apiConfig = require("../config/apiConfig");

const DOMESTIC_PATH_NAME = "국내여행";
const AREA_TARGET_PATH_NAMES = new Set(["해외여행", "지방출발"]);

/**
 * GetGnb 응답 트리를 재귀 순회하며 각 노드와 경로를 visit에 전달
 */
function walkGnbTree(value, path, visit) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkGnbTree(item, path, visit);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const nextPath = value.gnbCategoryName
    ? [...path, value.gnbCategoryName]
    : path;

  visit(value, nextPath);

  for (const childValue of Object.values(value)) {
    if (childValue && typeof childValue === "object") {
      walkGnbTree(childValue, nextPath, visit);
    }
  }
}

/**
 * 모두투어 GetGnb API를 호출해 최신 메뉴 트리를 가져온다
 */
async function fetchGnb() {
  const { baseUrl, endpoints, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoints.getGnb}`;

  const response = await axios.get(url, {
    headers: {
      ...headers,
      "x-incomming-pathname": "/package/search-result",
    },
  });

  if (!response.data || !response.data.isOK || !Array.isArray(response.data.result)) {
    const errorMsg =
      response.data?.errorMessages?.join(", ") || "Unknown error";
    throw new Error(`GetGnb failed: ${errorMsg}`);
  }

  return response.data.result;
}

/**
 * GetGnb 응답에서 ProductMaster 검색 대상 추출
 * - 지역 검색: areaKeywordNo
 * - 테마 검색: 국내여행 경로의 themeNo
 */
async function getProductMasterSearchTargets() {
  const gnbTree = await fetchGnb();
  const areaTargetMap = new Map();
  const themeTargetMap = new Map();

  walkGnbTree(gnbTree, [], (node, path) => {
    const hasSubCategories = Array.isArray(node.subCategories) && node.subCategories.length > 0;

    if (Array.isArray(node.areaKeywords)) {
      for (const keyword of node.areaKeywords) {
        const areaNo = Number(keyword.areaKeywordNo);
        if (
          !areaNo ||
          areaTargetMap.has(areaNo) ||
          !path.some((name) => AREA_TARGET_PATH_NAMES.has(name)) ||
          !hasSubCategories
        ) {
          continue;
        }

        areaTargetMap.set(areaNo, {
          type: "area",
          areaNo,
          name: node.gnbCategoryName || keyword.koreaName || keyword.englishName || String(areaNo),
          path,
        });
      }
    }

    if (node.themeNo && path.includes(DOMESTIC_PATH_NAME)) {
      const themeNo = Number(node.themeNo);
      if (!themeNo || themeTargetMap.has(themeNo)) return;

      themeTargetMap.set(themeNo, {
        type: "theme",
        themeNo,
        name: node.themeName || node.gnbCategoryName || String(themeNo),
        path,
      });
    }
  });

  return [
    ...Array.from(areaTargetMap.values()).sort((a, b) => a.areaNo - b.areaNo),
    ...Array.from(themeTargetMap.values()).sort((a, b) => a.themeNo - b.themeNo),
  ];
}

module.exports = {
  getProductMasterSearchTargets,
};
