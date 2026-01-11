import type { PrismaClient, VerifyIntent } from "@prisma/client";
import { createEmbeddedWallet } from "./privy.js";

type ConfirmDeps = {
  prisma: PrismaClient;
  userId: string;
  verifyIntentId: string;
  now?: Date;
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
    where: { commitment: intent.commitment }
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
        txSignature: "MOCK_TX",
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

  return {
    rewardLamports: intent.rewardLamports,
    walletPubkey
  };
};
