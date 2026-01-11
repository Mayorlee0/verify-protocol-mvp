import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import {
  buildQrPayload,
  decryptPlaintext,
  deriveCommitment,
  deriveSkuHash,
  encryptPlaintext,
  generateCode,
  getManufacturerSecret,
  loadEncryptionKey
} from "../utils/code.js";

const randomId = (prefix: string) => {
  const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}_${suffix}`;
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

  const manufacturerSecret = getManufacturerSecret();
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
  const generatedAt = new Date();
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
      status: "GENERATING"
    }
  });

  await prisma.code.createMany({
    data: codeRows.map(({ plaintext, ...row }) => row)
  });

  const readyPack = await prisma.codePack.update({
    where: { packId },
    data: {
      status: "READY"
    }
  });

  return {
    batch,
    codePack: readyPack,
    generatedAt
  };
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

export const buildPackCsv = async (prisma: PrismaClient, packId: string) => {
  const encryptionKey = loadEncryptionKey();
  const pack = await prisma.codePack.findUnique({
    where: { packId },
    include: { batch: { include: { sku: true } }, codes: true }
  });
  if (!pack) {
    throw new Error("PACK_NOT_FOUND");
  }
  if (pack.plaintextPurgedAt) {
    throw new Error("PLAINTEXT_PURGED");
  }
  if (pack.codes.some((code) => code.codePlaintext === null)) {
    throw new Error("PLAINTEXT_PURGED");
  }

  const csvHeader = "pack_id,batch_public_id,sku_code,code,qr_payload,generated_at,expiry_date";
  const generatedAt = pack.createdAt.toISOString();
  const expiryDate = pack.batch.expiryDate?.toISOString() ?? "";
  const csvRows = pack.codes.map((code) => {
    const plaintext = code.codePlaintext ? decryptPlaintext(code.codePlaintext, encryptionKey) : "";
    return [
      pack.packId,
      pack.batch.batchPublicId,
      pack.batch.sku.skuCode,
      plaintext,
      code.qrPayload,
      generatedAt,
      expiryDate
    ].join(",");
  });
  return [csvHeader, ...csvRows].join("\n");
};

export const activateBatch = async (prisma: PrismaClient, batchPublicId: string) => {
  const batch = await prisma.batch.findUnique({
    where: { batchPublicId },
    include: { codePacks: true }
  });
  if (!batch) {
    throw new Error("BATCH_NOT_FOUND");
  }
  const ready = batch.codePacks.some((pack) => pack.printConfirmedAt || pack.plaintextPurgedAt);
  if (!ready) {
    throw new Error("PRINT_NOT_CONFIRMED");
  }
  return prisma.batch.update({
    where: { batchPublicId },
    data: {
      status: "ACTIVE",
      activatedAt: new Date(),
      activatedTxSignature: "MOCK_TX"
    }
  });
};
