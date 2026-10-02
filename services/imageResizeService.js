const sharp = require("sharp");

// EP 이미지 상한. 이 박스 안에 들어가도록 비율을 유지한 채 축소한다.
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 768;

// JPEG 품질(1~100, 높을수록 고화질). 축소만으로 용량이 크게 줄어 보수적으로 잡는다.
const JPEG_QUALITY = 90;

// PNG 무손실 압축 레벨(0~9).
const PNG_COMPRESSION_LEVEL = 9;

// 확장자 → sharp 출력 포맷. 여기에 없는 확장자는 재인코딩하지 않고 원본을 그대로 쓴다.
// (알 수 없는 포맷을 임의로 바꾸면 파일명 확장자와 실제 내용이 어긋난다)
const FORMAT_BY_EXTENSION = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".webp": "webp",
};

/**
 * 출력 포맷별 인코딩 옵션을 적용한다.
 */
function applyFormat(pipeline, format) {
  if (format === "png") {
    return pipeline.png({ compressionLevel: PNG_COMPRESSION_LEVEL });
  }
  if (format === "webp") {
    return pipeline.webp({ quality: JPEG_QUALITY });
  }
  return pipeline.jpeg({ quality: JPEG_QUALITY });
}

/**
 * 이미지의 가로/세로 크기를 읽는다.
 */
async function readDimensions(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  return { width, height };
}

/**
 * 이미지 버퍼를 1024x768 박스에 맞춰 축소한다.
 * - 비율은 유지하고, 긴 변이 박스에 닿도록 맞춘다
 * - 박스보다 작거나 같은 이미지는 재인코딩하지 않고 원본을 그대로 돌려준다
 * - 외부 바이너리에 기대지 않는다. ffmpeg를 쓰던 때는 로컬에만 설치돼 있어
 *   서버리스에서 모든 상품이 리사이즈 단계에서 실패했다
 * @param {Buffer} buffer 원본 이미지
 * @param {string} extension 확장자(.jpg/.png 등). 출력 포맷을 원본과 맞추는 데 쓴다
 * @returns {Promise<{buffer: Buffer, resized: boolean, width: number, height: number}>}
 */
async function resizeImageBuffer(buffer, extension = ".jpg") {
  const ext = extension.toLowerCase() || ".jpg";
  const format = FORMAT_BY_EXTENSION[ext];

  const { width, height } = await readDimensions(buffer);

  // 크기를 못 읽었거나(깨진 헤더) 다룰 줄 모르는 포맷이면 손대지 않는다.
  if (!width || !height || !format) {
    return { buffer, resized: false, width: width || 0, height: height || 0 };
  }

  // 박스 이내면 손대지 않는다. 재인코딩은 화질만 깎는다.
  if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
    return { buffer, resized: false, width, height };
  }

  const pipeline = sharp(buffer).resize(MAX_WIDTH, MAX_HEIGHT, {
    fit: "inside",
    withoutEnlargement: true,
  });

  const { data, info } = await applyFormat(pipeline, format).toBuffer({
    resolveWithObject: true,
  });

  return {
    buffer: data,
    resized: true,
    width: info.width,
    height: info.height,
  };
}

module.exports = {
  MAX_WIDTH,
  MAX_HEIGHT,
  JPEG_QUALITY,
  readDimensions,
  resizeImageBuffer,
};
