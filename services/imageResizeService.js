const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// EP 이미지 상한. 이 박스 안에 들어가도록 비율을 유지한 채 축소한다.
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 768;

// JPEG 품질(2~31, 낮을수록 고화질). 축소만으로 용량이 크게 줄어 보수적으로 잡는다.
const JPEG_QUALITY = 5;

let ffmpegChecked = false;

/**
 * ffmpeg/ffprobe가 설치되어 있는지 확인한다(최초 1회).
 * - 없으면 원본을 그대로 올려 용량이 다시 폭증하므로, 조용히 넘어가지 않고 중단한다
 */
async function ensureFfmpeg() {
  if (ffmpegChecked) return;

  for (const bin of ["ffmpeg", "ffprobe"]) {
    try {
      await execFileAsync(bin, ["-version"]);
    } catch {
      throw new Error(
        `${bin}가 설치되어 있지 않아 이미지 리사이즈를 할 수 없습니다. 원본을 그대로 올리면 FTP 용량이 다시 넘치므로 중단합니다.`,
      );
    }
  }

  ffmpegChecked = true;
}

/**
 * 이미지의 가로/세로 크기를 읽는다.
 */
async function readDimensions(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    filePath,
  ]);

  const [width, height] = stdout.trim().split(",").map(Number);
  return { width, height };
}

/**
 * 이미지 버퍼를 1024x768 박스에 맞춰 축소한다.
 * - 비율은 유지하고, 긴 변이 박스에 닿도록 맞춘다
 * - 박스보다 작거나 같은 이미지는 재인코딩하지 않고 원본을 그대로 돌려준다
 * @param {Buffer} buffer 원본 이미지
 * @param {string} extension 확장자(.jpg/.png 등). 출력 포맷을 원본과 맞추는 데 쓴다
 * @returns {Promise<{buffer: Buffer, resized: boolean, width: number, height: number}>}
 */
async function resizeImageBuffer(buffer, extension = ".jpg") {
  await ensureFfmpeg();

  const ext = extension.toLowerCase() || ".jpg";
  const token = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join(os.tmpdir(), `ep-resize-${token}-in${ext}`);
  const outputPath = path.join(os.tmpdir(), `ep-resize-${token}-out${ext}`);

  try {
    fs.writeFileSync(inputPath, buffer);

    const { width, height } = await readDimensions(inputPath);

    // 박스 이내면 손대지 않는다. 재인코딩은 화질만 깎는다.
    if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
      return { buffer, resized: false, width, height };
    }

    // PNG는 -q:v가 적용되지 않으므로 무손실 압축 레벨을 쓴다.
    const encodeArgs =
      ext === ".png"
        ? ["-compression_level", "9"]
        : ["-q:v", String(JPEG_QUALITY)];

    await execFileAsync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      inputPath,
      "-vf",
      `scale=${MAX_WIDTH}:${MAX_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      ...encodeArgs,
      outputPath,
    ]);

    const resizedBuffer = fs.readFileSync(outputPath);
    const after = await readDimensions(outputPath);

    return {
      buffer: resizedBuffer,
      resized: true,
      width: after.width,
      height: after.height,
    };
  } finally {
    for (const p of [inputPath, outputPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        // 임시 파일 정리 실패는 결과에 영향이 없다.
      }
    }
  }
}

module.exports = {
  MAX_WIDTH,
  MAX_HEIGHT,
  JPEG_QUALITY,
  ensureFfmpeg,
  readDimensions,
  resizeImageBuffer,
};
