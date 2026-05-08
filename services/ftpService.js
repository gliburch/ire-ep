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
async function createClient() {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  await client.access(FTP_CONFIG);
  return client;
}

/**
 * URL에서 파일 확장자 추출
 */
function getExtension(url) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return ext || ".jpg";
}

/**
 * URL로부터 고유 파일명 생성
 */
function generateFilename(url) {
  const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 12);
  const ext = getExtension(url);
  return `${hash}${ext}`;
}

/**
 * FTP에 존재하는 파일 목록 조회 (캐시)
 */
let existingFilesCache = null;
async function getExistingFiles(client) {
  if (existingFilesCache) return existingFilesCache;

  const list = await client.list(IMAGE_DIR);
  existingFilesCache = new Set(list.map((f) => f.name));
  return existingFilesCache;
}

/**
 * 이미지 다운로드 후 FTP 업로드 (클라이언트 재사용)
 */
async function uploadImageWithClient(client, imageUrl) {
  if (!imageUrl) return "";

  const filename = generateFilename(imageUrl);
  const remotePath = `${IMAGE_DIR}/${filename}`;
  const publicUrl = `${FTP_BASE_URL}/image/${filename}`;

  // 캐시에서 확인
  if (uploadedCache.has(filename)) {
    return publicUrl;
  }

  // 기존 파일 확인
  const existingFiles = await getExistingFiles(client);
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
  await client.uploadFrom(stream, remotePath);

  uploadedCache.add(filename);
  existingFilesCache?.add(filename);

  return publicUrl;
}

/**
 * 이미지 다운로드 후 FTP 업로드 (단일)
 */
async function uploadImage(imageUrl) {
  const client = await createClient();
  try {
    return await uploadImageWithClient(client, imageUrl);
  } finally {
    client.close();
  }
}

/**
 * 여러 이미지를 순차 업로드 (하나의 연결 사용)
 */
async function uploadImagesWithClient(client, imageUrls) {
  const results = [];
  for (const url of imageUrls) {
    try {
      const result = await uploadImageWithClient(client, url);
      results.push(result);
    } catch (err) {
      results.push("");
    }
  }
  return results;
}

/**
 * EP 파일 FTP 업로드
 */
async function uploadEpFile(content, filename = "ire_naver_ep.txt") {
  const remotePath = `${EP_DIR}/${filename}`;

  const client = await createClient();
  try {
    const normalizedContent = content.startsWith("\uFEFF")
      ? content
      : `\uFEFF${content}`;
    const stream = Readable.from(Buffer.from(normalizedContent, "utf-8"));
    await client.uploadFrom(stream, remotePath);
    return `${FTP_BASE_URL}/ep/${filename}`;
  } finally {
    client.close();
  }
}

/**
 * 캐시 초기화
 */
function clearCache() {
  uploadedCache.clear();
  existingFilesCache = null;
}

module.exports = {
  createClient,
  uploadImage,
  uploadImageWithClient,
  uploadImagesWithClient,
  uploadEpFile,
  generateFilename,
  clearCache,
  FTP_BASE_URL,
};
