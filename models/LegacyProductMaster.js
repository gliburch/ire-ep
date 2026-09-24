const mongoose = require("mongoose");
const ProductMaster = require("./ProductMaster");

// 컬렉션 네이밍 컨벤션을 camelCase로 바꾸기 전에 쌓인 데이터가
// 구 컬렉션명(productmasters)에 그대로 남아 있어 이를 읽기 위한 모델.
// 스키마는 ProductMaster와 동일하고 바라보는 컬렉션만 다르다.
module.exports = mongoose.model("LegacyProductMaster", ProductMaster.schema, "productmasters");
