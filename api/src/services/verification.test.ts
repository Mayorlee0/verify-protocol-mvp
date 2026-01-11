import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { confirmVerification } from "./verification.js";

vi.mock("./privy.js", () => ({
  createEmbeddedWallet: vi.fn(async () => ({ wallet_pubkey: "WALLET_123" }))
}));

type Intent = {
  verifyIntentId: string;
  status: "ISSUED" | "CONFIRMED" | "EXPIRED";
  expiresAt: Date;
  commitment: Buffer;
  batchId: string;
  rewardLamports: bigint;
};

describe("confirmVerification", () => {
  it("creates wallet after successful confirm", async () => {
    const intent: Intent = {
      verifyIntentId: "vfyint_1",
      status: "ISSUED",
      expiresAt: new Date(Date.now() + 60_000),
      commitment: Buffer.from("abc"),
      batchId: "batch_1",
      rewardLamports: BigInt(100)
    };

    const verifyIntent = {
      findUnique: vi.fn().mockResolvedValue(intent),
      update: vi.fn().mockResolvedValue(intent)
    };
    const verification = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({})
    };
    const userWallet = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({})
    };
    const transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

    const prisma = {
      verifyIntent,
      verification,
      userWallet,
      $transaction: transaction
    } as unknown as PrismaClient;

    const result = await confirmVerification({
      prisma,
      userId: "user_1",
      verifyIntentId: "vfyint_1"
    });

    expect(result.walletPubkey).toBe("WALLET_123");
    expect(userWallet.create).toHaveBeenCalled();
  });

  it("does not create wallet when confirm fails", async () => {
    const intent: Intent = {
      verifyIntentId: "vfyint_2",
      status: "ISSUED",
      expiresAt: new Date(Date.now() - 60_000),
      commitment: Buffer.from("abc"),
      batchId: "batch_1",
      rewardLamports: BigInt(100)
    };

    const verifyIntent = {
      findUnique: vi.fn().mockResolvedValue(intent),
      update: vi.fn().mockResolvedValue(intent)
    };
    const verification = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({})
    };
    const userWallet = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({})
    };
    const transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

    const prisma = {
      verifyIntent,
      verification,
      userWallet,
      $transaction: transaction
    } as unknown as PrismaClient;

    await expect(
      confirmVerification({
        prisma,
        userId: "user_1",
        verifyIntentId: "vfyint_2"
      })
    ).rejects.toThrow("INTENT_EXPIRED");

    expect(userWallet.create).not.toHaveBeenCalled();
  });
});
