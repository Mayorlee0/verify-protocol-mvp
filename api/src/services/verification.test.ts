import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { confirmVerification, quoteVerification } from "./verification.js";

vi.mock("./privy.js", () => ({
  createEmbeddedWallet: vi.fn(async () => ({ wallet_pubkey: "WALLET_123" }))
}));

vi.mock("./solana.js", () => ({
  verifyAndPaySol: vi.fn(async () => "SIG_123")
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

    process.env.MANUFACTURER_PDA = "11111111111111111111111111111111";
    process.env.BATCH_PDA = "11111111111111111111111111111111";
    process.env.TREASURY_PDA = "11111111111111111111111111111111";
    process.env.SOL_PAYOUT_VAULT = "11111111111111111111111111111111";

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

    process.env.MANUFACTURER_PDA = "11111111111111111111111111111111";
    process.env.BATCH_PDA = "11111111111111111111111111111111";
    process.env.TREASURY_PDA = "11111111111111111111111111111111";
    process.env.SOL_PAYOUT_VAULT = "11111111111111111111111111111111";

    await expect(
      confirmVerification({
        prisma,
        userId: "user_1",
        verifyIntentId: "vfyint_2"
      })
    ).rejects.toThrow("INTENT_EXPIRED");

    expect(userWallet.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate verification for commitment", async () => {
    const intent: Intent = {
      verifyIntentId: "vfyint_dup",
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
      findFirst: vi.fn().mockResolvedValue({ id: "v1" }),
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

    process.env.MANUFACTURER_PDA = "11111111111111111111111111111111";
    process.env.BATCH_PDA = "11111111111111111111111111111111";
    process.env.TREASURY_PDA = "11111111111111111111111111111111";
    process.env.SOL_PAYOUT_VAULT = "11111111111111111111111111111111";

    await expect(
      confirmVerification({
        prisma,
        userId: "user_1",
        verifyIntentId: "vfyint_dup"
      })
    ).rejects.toThrow("CODE_USED");
    expect(userWallet.create).not.toHaveBeenCalled();
  });

  it("does not create wallet when on-chain call fails", async () => {
    const { verifyAndPaySol } = await import("./solana.js");
    (verifyAndPaySol as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error("CHAIN_FAIL")
    );

    const intent: Intent = {
      verifyIntentId: "vfyint_chain",
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

    process.env.MANUFACTURER_PDA = "11111111111111111111111111111111";
    process.env.BATCH_PDA = "11111111111111111111111111111111";
    process.env.TREASURY_PDA = "11111111111111111111111111111111";
    process.env.SOL_PAYOUT_VAULT = "11111111111111111111111111111111";

    await expect(
      confirmVerification({
        prisma,
        userId: "user_1",
        verifyIntentId: "vfyint_chain"
      })
    ).rejects.toThrow("CHAIN_FAIL");

    expect(userWallet.create).not.toHaveBeenCalled();
    expect(verification.create).not.toHaveBeenCalled();
  });
});

describe("quoteVerification", () => {
  it("rejects when batch is not active", async () => {
    const prisma = {
      batch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch_1",
          status: "CREATED",
          batchPublicId: "BATCH_1",
          sku: { skuHash: Buffer.from("hash") }
        })
      }
    } as unknown as PrismaClient;

    await expect(
      quoteVerification({
        prisma,
        batchPublicId: "BATCH_1",
        code: "CODE",
        rewardLamports: 1,
        intentTtlSeconds: 120
      })
    ).rejects.toThrow("BATCH_NOT_ACTIVE");
  });
});
