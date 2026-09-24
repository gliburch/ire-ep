const ftp = require("basic-ftp");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

const FTP_CONFIG = {
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  secure: false,
};

const FTP_BASE_URL = process.env.FTP_BASE_URL;
const IMAGE_DIR = "/www/image";
const EP_DIR = "/www/ep";

// 업로드된 파일 캐시 (세션 내 중복 방지)
const uploadedCache = new Set();

/**
 * FTP 클라이언트 생성 및 접속
 */
async function createFtpClient() {
  const ftpClient = new ftp.Client(120000);
  ftpClient.ftp.verbose = false;
  await ftpClient.access(FTP_CONFIG);
  return ftpClient;
}

// FTP 연결 재시도 설정. cafe24 FTP는 접속이 몰리면 일시적으로 거부하므로
// 곧바로 포기하지 않고 지수 백오프로 몇 차례 기다렸다 다시 붙는다.
const FTP_CONNECT_ATTEMPTS = 5;
const FTP_RETRY_BASE_MS = 2000;

/**
 * FTP 연결을 지수 백오프로 재시도한다.
 * - 모든 시도가 실패하면 에러를 던진다(호출측에서 중단 판단)
 */
async function connectFtpWithRetry(context = "") {
  let lastError = null;

  for (let attempt = 1; attempt <= FTP_CONNECT_ATTEMPTS; attempt++) {
    try {
      return await createFtpClient();
    } catch (err) {
      lastError = err;

      if (attempt === FTP_CONNECT_ATTEMPTS) break;

      const waitMs = FTP_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `[WARN] FTP 연결 실패${context}, ${waitMs / 1000}초 후 재시도 (${attempt}/${FTP_CONNECT_ATTEMPTS}): ${err.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw new Error(
    `FTP 연결에 ${FTP_CONNECT_ATTEMPTS}회 연속 실패했습니다${context}: ${lastError?.message}`,
  );
}

/**
 * FTP 연결 자체가 끊겼거나 거부된 에러인지 판정한다.
 */
function isFtpConnectionError(err) {
  const message = err?.message || "";
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|Timeout|closed/i.test(message);
}

/**
 * FTP 저장 용량(quota) 초과인지 판정한다.
 * - 재연결로는 절대 풀리지 않으므로 즉시 중단해야 하는 에러
 * - 서버가 552로 답하기도 하고, 전송 도중 소켓을 끊어 ECONNRESET/EPIPE로 나타나기도 한다
 */
function isFtpQuotaError(err) {
  const message = err?.message || "";
  return /disk quota|quota exceeded|552|insufficient storage|not enough space/i.test(
    message,
  );
}

/**
 * FTP에 쓰기가 가능한지(용량이 남았는지) 직접 확인한다.
 * - 용량 초과는 552로 답할 때도 있고 전송 중 소켓을 끊어 EPIPE로 나타날 때도 있어
 *   에러 메시지만으로는 구분되지 않는다. 작은 파일을 실제로 올려보고 판정한다.
 * @returns {Promise<{writable: boolean, reason: string｜null}>}
 */
async function checkFtpWritable(ftpClient) {
  const probePath = `${IMAGE_DIR}/.__writeprobe.tmp`;

  try {
    await ftpClient.uploadFrom(Readable.from(Buffer.from("probe")), probePath);
  } catch (err) {
    return { writable: false, reason: err.message };
  }

  try {
    await ftpClient.remove(probePath);
  } catch {
    // 프로브 파일 정리는 실패해도 판정에는 영향이 없다.
  }

  return { writable: true, reason: null };
}

/**
 * URL에서 파일 확장자 추출
 */
function getImageExtension(url) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return ext || ".jpg";
}

/**
 * URL로부터 고유 파일명 생성
 */
function buildImageFilename(url) {
  const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 12);
  const ext = getImageExtension(url);
  return `${hash}${ext}`;
}

/**
 * FTP 이미지 디렉터리 파일 목록 조회 (캐시)
 */
let existingFilesCache = null;
async function getExistingImageFilenames(ftpClient) {
  if (existingFilesCache) return existingFilesCache;

  const list = await ftpClient.list(IMAGE_DIR);
  existingFilesCache = new Set(list.map((f) => f.name));
  return existingFilesCache;
}

/**
 * 이미지 다운로드 후 FTP 업로드 (클라이언트 재사용)
 */
async function uploadImageToFtp(ftpClient, imageUrl) {
  if (!imageUrl) return "";

  const filename = buildImageFilename(imageUrl);
  const remotePath = `${IMAGE_DIR}/${filename}`;
  const publicUrl = `${FTP_BASE_URL}/image/${filename}`;

  // 캐시에서 확인
  if (uploadedCache.has(filename)) {
    return publicUrl;
  }

  // 기존 파일 확인
  const existingFiles = await getExistingImageFilenames(ftpClient);
  if (existingFiles.has(filename)) {
    uploadedCache.add(filename);
    return publicUrl;
  }

  // 이미지 다운로드
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
  });

  // 업로드
  const stream = Readable.from(Buffer.from(response.data));
  await ftpClient.uploadFrom(stream, remotePath);

  uploadedCache.add(filename);
  existingFilesCache?.add(filename);

  return publicUrl;
}

/**
 * EP 파일 FTP 업로드
 */
async function uploadEpFileToFtp(content, filename = "ire_naver_ep.txt") {
  const remotePath = `${EP_DIR}/${filename}`;

  const ftpClient = await createFtpClient();
  try {
    const normalizedContent = content.replace(/^\uFEFF/, "");
    const stream = Readable.from(Buffer.from(normalizedContent, "utf-8"));
    await ftpClient.uploadFrom(stream, remotePath);
    return `${FTP_BASE_URL}/ep/${filename}`;
  } finally {
    ftpClient.close();
  }
}

/**
 * 로컬 EP 파일을 그대로 FTP에 업로드
 * - 파일이 크므로 메모리에 올리지 않고 디스크에서 바로 스트리밍한다
 * @param {string} localPath 업로드할 로컬 파일 경로
 * @param {string} filename EP 디렉터리에 저장될 파일명
 * @param {(info: {bytes: number}) => void} [onProgress]
 */
async function uploadEpFileFromPath(localPath, filename, onProgress) {
  const remotePath = `${EP_DIR}/${filename}`;

  const ftpClient = await createFtpClient();
  try {
    if (onProgress) {
      ftpClient.trackProgress((info) => onProgress(info));
    }
    await ftpClient.uploadFrom(localPath, remotePath);
    return `${FTP_BASE_URL}/ep/${filename}`;
  } finally {
    ftpClient.trackProgress();
    ftpClient.close();
  }
}

/**
 * 캐시 초기화
 */
function resetImageUploadCache() {
  uploadedCache.clear();
  existingFilesCache = null;
}

module.exports = {
  createFtpClient,
  connectFtpWithRetry,
  checkFtpWritable,
  isFtpConnectionError,
  isFtpQuotaError,
  uploadImageToFtp,
  uploadEpFileToFtp,
  uploadEpFileFromPath,
  resetImageUploadCache,
};
