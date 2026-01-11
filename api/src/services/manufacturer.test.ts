import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { confirmPrinted } from "./manufacturer.js";

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
