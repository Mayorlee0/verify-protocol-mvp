import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import {
  buildQrPayload,
  deriveCommitment,
  deriveSkuHash,
  encryptPlaintext,
  generateCode,
  getManufacturerSecret,
  loadEncryptionKey
} from "../utils/code.js";

const PACK_DOWNLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const randomId = (prefix: string) => {
  const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}_${suffix}`;
};

const packCsvPath = (packId: string) => {
  return path.join("/tmp", `pack_${packId}.csv`);
};

export type CreateBatchInput = {
  manufacturerId: string;
  skuCode: string;
  skuName?: string;
  batchLabel: string;
  expiryDate?: string;
  quantity: number;
  rewardUsdTarget?: number;
};

export const createBatchAndPack = async (prisma: PrismaClient, input: CreateBatchInput) => {
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: input.manufacturerId }
  });

  if (!manufacturer) {
    throw new Error("MANUFACTURER_NOT_FOUND");
  }

  const manufacturerSecret = getManufacturerSecret(manufacturer.id);
  const encryptionKey = loadEncryptionKey();

  let sku = await prisma.sku.findFirst({
    where: { manufacturerId: manufacturer.id, skuCode: input.skuCode }
  });

  if (!sku) {
    sku = await prisma.sku.create({
      data: {
        manufacturerId: manufacturer.id,
        skuCode: input.skuCode,
        skuName: input.skuName ?? input.skuCode,
        skuHash: deriveSkuHash(input.skuCode)
      }
    });
  }

  const batchPublicId = randomId("BATCH");
  const batch = await prisma.batch.create({
    data: {
      manufacturerId: manufacturer.id,
      skuId: sku.id,
      batchPublicId,
      batchLabel: input.batchLabel,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      rewardUsdTarget: input.rewardUsdTarget ?? 0.1,
      status: "CREATED"
    }
  });

  const packId = randomId("PACK");
  const expiresAt = new Date(Date.now() + PACK_DOWNLOAD_TTL_MS);
  const codeRows = [] as {
    packId: string;
    codePlaintext: string;
    qrPayload: string;
    commitment: Buffer;
    onchainCodePda: string;
    plaintext: string;
  }[];

  for (let i = 0; i < input.quantity; i += 1) {
    const code = generateCode();
    const qrPayload = buildQrPayload(batch.batchPublicId, code);
    const commitment = deriveCommitment({
      manufacturerSecret,
      code,
      batchPublicId: batch.batchPublicId,
      skuHash: sku.skuHash
    });
    const encrypted = encryptPlaintext(code, encryptionKey);
    codeRows.push({
      packId: packId,
      codePlaintext: encrypted,
      qrPayload,
      commitment,
      onchainCodePda: "PDA_PENDING",
      plaintext: code
    });
  }

  const codePack = await prisma.codePack.create({
    data: {
      packId,
      batchId: batch.id,
      quantity: input.quantity,
      status: "READY",
      downloadExpiresAt: expiresAt
    }
  });

  await prisma.code.createMany({
    data: codeRows.map(({ plaintext, ...row }) => row)
  });

  const generatedAt = new Date();
  const csvHeader = "pack_id,batch_public_id,sku_code,code,qr_payload,expires_at,generated_at";
  const csvRows = codeRows.map((row) => {
    return [
      codePack.packId,
      batch.batchPublicId,
      input.skuCode,
      row.plaintext,
      row.qrPayload,
      expiresAt.toISOString(),
      generatedAt.toISOString()
    ].join(",");
  });
  const csvContents = [csvHeader, ...csvRows].join("\n");
  const csvPath = packCsvPath(codePack.packId);
  await fs.writeFile(csvPath, csvContents, "utf8");

  return {
    batch,
    codePack,
    downloadUrl: `file://${csvPath}`,
    expiresAt
  };
};

export const getPackDownloadUrl = (packId: string) => {
  const csvPath = packCsvPath(packId);
  return `file://${csvPath}`;
};

export const confirmPrinted = async (prisma: PrismaClient, packId: string) => {
  const now = new Date();
  await prisma.$transaction([
    prisma.code.updateMany({
      where: { packId },
      data: { codePlaintext: null }
    }),
    prisma.codePack.update({
      where: { packId },
      data: {
        status: "PRINT_CONFIRMED",
        printConfirmedAt: now,
        plaintextPurgedAt: now
      }
    })
  ]);
};
