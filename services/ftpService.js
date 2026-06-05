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
 * 캐시 초기화
 */
function resetImageUploadCache() {
  uploadedCache.clear();
  existingFilesCache = null;
}

module.exports = {
  createFtpClient,
  uploadImageToFtp,
  uploadEpFileToFtp,
  resetImageUploadCache,
};
