import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { activateBatch, confirmPrinted } from "./manufacturer.js";

describe("confirmPrinted", () => {
  it("purges plaintext codes for a pack", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const update = vi.fn().mockResolvedValue({});
    const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));

    const prisma = {
      code: { updateMany },
      codePack: { update },
      $transaction: transaction
    } as unknown as PrismaClient;

    await confirmPrinted(prisma, "PACK_TEST");

    expect(updateMany).toHaveBeenCalledWith({
      where: { packId: "PACK_TEST" },
      data: { codePlaintext: null }
    });

    expect(update).toHaveBeenCalledWith({
      where: { packId: "PACK_TEST" },
      data: expect.objectContaining({
        status: "PRINT_CONFIRMED"
      })
    });
  });
});

describe("activateBatch", () => {
  it("rejects activation when not print-confirmed", async () => {
    const batch = {
      id: "batch_1",
      codePacks: [{ printConfirmedAt: null, plaintextPurgedAt: null }]
    };
    const findUnique = vi.fn().mockResolvedValue(batch);
    const update = vi.fn();
    const prisma = {
      batch: { findUnique, update }
    } as unknown as PrismaClient;

    await expect(activateBatch(prisma, "BATCH_1")).rejects.toThrow("PRINT_NOT_CONFIRMED");
    expect(update).not.toHaveBeenCalled();
  });
});
