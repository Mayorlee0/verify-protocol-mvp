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

export const decryptPlaintext = (payload: string, key: Buffer) => {
  const [version, ivB64, ciphertextB64, tagB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !ciphertextB64 || !tagB64) {
    throw new Error("INVALID_CIPHERTEXT");
  }
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
};

export const loadEncryptionKey = () => {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required");
  }
  const isHex = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64;
  const key = Buffer.from(raw, isHex ? "hex" : "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes base64 or hex");
  }
  return key;
};

export const getManufacturerSecret = () => {
  const secret = process.env.MANUFACTURER_SECRET;
  if (!secret) {
    throw new Error("MANUFACTURER_SECRET is required");
  }
  return secret;
};
