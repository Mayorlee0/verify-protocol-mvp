import crypto from "crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUP_COUNT = 4;
const GROUP_LENGTH = 4;

export const CODE_BODY_LENGTH = GROUP_COUNT * GROUP_LENGTH;

const randomAlphabetChar = () => {
  const max = 256 - (256 % CODE_ALPHABET.length);
  while (true) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < max) {
      return CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
};

const checksumChar = (body: string) => {
  const hash = crypto.createHash("sha256").update(body).digest();
  return CODE_ALPHABET[hash[0] % CODE_ALPHABET.length];
};

export const generateCode = () => {
  const chars = Array.from({ length: CODE_BODY_LENGTH }, () => randomAlphabetChar());
  const body = chars.join("");
  const checksum = checksumChar(body);
  const grouped = [];
  for (let i = 0; i < GROUP_COUNT; i += 1) {
    grouped.push(body.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH));
  }
  return `${grouped.join("-")}-${checksum}`;
};

export const validateCode = (code: string) => {
  const normalized = code.replace(/-/g, "").toUpperCase();
  if (normalized.length !== CODE_BODY_LENGTH + 1) {
    return false;
  }
  const body = normalized.slice(0, CODE_BODY_LENGTH);
  const checksum = normalized.slice(CODE_BODY_LENGTH);
  if (![...body].every((char) => CODE_ALPHABET.includes(char))) {
    return false;
  }
  return checksumChar(body) === checksum;
};

export const buildQrPayload = (batchPublicId: string, code: string) => {
  return `VFY1|${batchPublicId}|${code}`;
};

export const deriveCommitment = ({
  manufacturerSecret,
  code,
  batchPublicId,
  skuHash
}: {
  manufacturerSecret: string;
  code: string;
  batchPublicId: string;
  skuHash: Buffer;
}) => {
  const hmac = crypto.createHmac("sha256", manufacturerSecret);
  hmac.update(code, "utf8");
  hmac.update(batchPublicId, "utf8");
  hmac.update(skuHash);
  return hmac.digest();
};

export const deriveSkuHash = (skuCode: string) => {
  return crypto.createHash("sha256").update(skuCode, "utf8").digest();
};

export const encryptPlaintext = (plaintext: string, key: Buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
};

export const loadEncryptionKey = () => {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes base64");
  }
  return key;
};

export const getManufacturerSecret = (manufacturerId: string) => {
  const envKey = `MANUFACTURER_SECRET_${manufacturerId.replace(/-/g, "_").toUpperCase()}`;
  const secret = process.env[envKey];
  if (!secret) {
    throw new Error(`Missing manufacturer secret in env: ${envKey}`);
  }
  return secret;
};
