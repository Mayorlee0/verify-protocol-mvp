import type { PrismaClient, VerifyIntent } from "@prisma/client";
import crypto from "crypto";
import { deriveCommitment, getManufacturerSecret } from "../utils/code.js";
import { createEmbeddedWallet } from "./privy.js";

type ConfirmDeps = {
  prisma: PrismaClient;
  userId: string;
  verifyIntentId: string;
  now?: Date;
};

type QuoteDeps = {
  prisma: PrismaClient;
  batchPublicId: string;
  code: string;
  rewardLamports: number;
  intentTtlSeconds: number;
};

export const buildSponsoredTx = (instruction: string) => {
  const sponsor = process.env.SPONSOR_WALLET_PUBKEY;
  if (!sponsor) {
    throw new Error("SPONSOR_WALLET_PUBKEY_MISSING");
  }
  return {
    instruction,
    feePayer: sponsor
  };
};

const ensureIntentActive = async (prisma: PrismaClient, intent: VerifyIntent, now: Date) => {
  if (intent.status !== "ISSUED") {
    throw new Error("INTENT_ALREADY_USED");
  }
  if (intent.expiresAt.getTime() < now.getTime()) {
    await prisma.verifyIntent.update({
      where: { verifyIntentId: intent.verifyIntentId },
      data: { status: "EXPIRED" }
    });
    throw new Error("INTENT_EXPIRED");
  }
};

export const confirmVerification = async ({ prisma, userId, verifyIntentId, now = new Date() }: ConfirmDeps) => {
  const intent = await prisma.verifyIntent.findUnique({
    where: { verifyIntentId }
  });
  if (!intent) {
    throw new Error("INTENT_NOT_FOUND");
  }

  await ensureIntentActive(prisma, intent, now);

  const existingVerification = await prisma.verification.findFirst({
    where: { batchId: intent.batchId, commitment: intent.commitment }
  });
  if (existingVerification) {
    throw new Error("CODE_USED");
  }

  const existingWallet = await prisma.userWallet.findFirst({
    where: { userId }
  });

  let walletPubkey = existingWallet?.walletPubkey ?? null;
  if (!walletPubkey) {
    const wallet = await createEmbeddedWallet(userId);
    walletPubkey = wallet.wallet_pubkey;
  }

  buildSponsoredTx("verify_and_pay_sol");

  try {
    await prisma.$transaction([
      prisma.verifyIntent.update({
        where: { verifyIntentId },
        data: { status: "CONFIRMED" }
      }),
      prisma.verification.create({
        data: {
          batchId: intent.batchId,
          userId,
          commitment: intent.commitment,
          codePda: "MOCK_PDA",
          rewardLamports: intent.rewardLamports,
          txSignature: "MOCK_VERIFY_TX",
          verifiedAt: now,
          result: "SUCCESS"
        }
      }),
      ...(existingWallet
        ? []
        : [
            prisma.userWallet.create({
              data: {
                userId,
                walletPubkey: walletPubkey,
                chain: "solana",
                createdAfterFirstSuccess: true
              }
            })
          ])
    ]);
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === "P2002") {
      throw new Error("CODE_USED");
    }
    throw error;
  }

  return {
    rewardLamports: intent.rewardLamports,
    walletPubkey
  };
};

export const quoteVerification = async ({
  prisma,
  batchPublicId,
  code,
  rewardLamports,
  intentTtlSeconds
}: QuoteDeps) => {
  const batch = await prisma.batch.findUnique({
    where: { batchPublicId },
    include: { sku: true }
  });
  if (!batch) {
    throw new Error("CODE_NOT_FOUND");
  }
  if (batch.status !== "ACTIVE") {
    throw new Error("BATCH_NOT_ACTIVE");
  }

  const manufacturerSecret = getManufacturerSecret();
  const commitment = deriveCommitment({
    manufacturerSecret,
    code,
    batchPublicId: batch.batchPublicId,
    skuHash: batch.sku.skuHash
  });

  const codeRow = await prisma.code.findFirst({
    where: { commitment }
  });
  if (!codeRow) {
    throw new Error("CODE_NOT_FOUND");
  }

  const existingVerification = await prisma.verification.findFirst({
    where: { batchId: batch.id, commitment }
  });
  if (existingVerification) {
    throw new Error("CODE_USED");
  }

  const verifyIntentId = `vfyint_${crypto.randomBytes(6).toString("hex")}`;
  const expiresAt = new Date(Date.now() + intentTtlSeconds * 1000);
  await prisma.verifyIntent.create({
    data: {
      verifyIntentId,
      batchId: batch.id,
      commitment,
      rewardLamports: BigInt(rewardLamports),
      expiresAt,
      status: "ISSUED"
    }
  });

  return {
    verifyIntentId,
    expiresAt,
    rewardLamports
  };
};
