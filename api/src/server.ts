import Fastify from "fastify";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { deriveCommitment, getManufacturerSecret } from "./utils/code.js";
import { createBatchAndPack, confirmPrinted, getPackDownloadUrl } from "./services/manufacturer.js";
import { startEmailOtp, verifyEmailOtp } from "./services/privy.js";
import { confirmVerification } from "./services/verification.js";

const server = Fastify({ logger: true });
const prisma = new PrismaClient();
const rewardLamports = Number(process.env.REWARD_LAMPORTS ?? 100000);

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitWindowMs = 60_000;
const rateLimitMax = 30;
const rateLimitStore = new Map<string, RateLimitEntry>();

const isRateLimited = (key: string) => {
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
    return false;
  }
  existing.count += 1;
  if (existing.count > rateLimitMax) {
    return true;
  }
  return false;
};

const requireAuth = async (request: { headers: Record<string, string | undefined> }) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }
  const token = authHeader.replace("Bearer ", "");
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET_MISSING");
  }
  const payload = jwt.verify(token, secret) as { user_id: string; email: string };
  return payload;
};

const upsertUser = async (email: string, privyUserId?: string) => {
  return prisma.user.upsert({
    where: { email },
    update: privyUserId ? { privyUserId } : {},
    create: { email, privyUserId }
  });
};

server.post("/auth/start", async (request, reply) => {
  const body = request.body as { email?: string };
  if (!body?.email) {
    return reply.code(400).send({ status: "ERROR", reason: "EMAIL_REQUIRED" });
  }
  try {
    const response = await startEmailOtp(body.email);
    return reply.send({ status: "OTP_SENT", request_id: response.request_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return reply.code(400).send({ status: "ERROR", reason: message });
  }
});

server.post("/auth/verify", async (request, reply) => {
  const body = request.body as { email?: string; otp?: string };
  if (!body?.email || !body.otp) {
    return reply.code(400).send({ status: "ERROR", reason: "INVALID_REQUEST" });
  }
  try {
    const result = await verifyEmailOtp(body.email, body.otp);
    const user = await upsertUser(result.email, result.user_id);
    const wallet = await prisma.userWallet.findFirst({ where: { userId: user.id } });
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return reply.code(500).send({ status: "ERROR", reason: "JWT_SECRET_MISSING" });
    }
    const sessionToken = jwt.sign({ user_id: user.id, email: user.email }, secret, {
      expiresIn: "7d"
    });
    return reply.send({
      status: "AUTHENTICATED",
      session_token: sessionToken,
      user_id: user.id,
      has_embedded_wallet: Boolean(wallet)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return reply.code(400).send({ status: "ERROR", reason: message });
  }
});

server.post("/verify/quote", async (request, reply) => {
  const body = request.body as {
    batch_public_id?: string;
    code?: string;
    client?: { captcha_token?: string };
  };
  if (!body?.batch_public_id || !body.code) {
    return reply.code(400).send({ status: "ERROR", reason: "INVALID_REQUEST" });
  }
  const clientKey = request.ip ?? "unknown";
  if (isRateLimited(clientKey)) {
    return reply.code(429).send({ status: "NOT_ELIGIBLE", reason: "RATE_LIMITED" });
  }

  const batch = await prisma.batch.findUnique({
    where: { batchPublicId: body.batch_public_id },
    include: { sku: true, manufacturer: true }
  });
  if (!batch) {
    return reply.send({ status: "NOT_ELIGIBLE", reason: "CODE_NOT_FOUND" });
  }
  if (batch.status !== "ACTIVE") {
    return reply.send({ status: "NOT_ELIGIBLE", reason: "BATCH_NOT_ACTIVE" });
  }

  let commitment: Buffer;
  try {
    const manufacturerSecret = getManufacturerSecret(batch.manufacturer.id);
    commitment = deriveCommitment({
      manufacturerSecret,
      code: body.code,
      batchPublicId: batch.batchPublicId,
      skuHash: batch.sku.skuHash
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return reply.code(400).send({ status: "ERROR", reason: message });
  }

  const codeRow = await prisma.code.findFirst({
    where: { commitment }
  });
  if (!codeRow) {
    return reply.send({ status: "NOT_ELIGIBLE", reason: "CODE_NOT_FOUND" });
  }

  const verifyIntentId = `vfyint_${crypto.randomBytes(6).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
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

  return reply.send({
    status: "ELIGIBLE",
    verify_intent_id: verifyIntentId,
    reward: {
      usd_target: "0.10",
      lamports: rewardLamports,
      pricing_source: "env_config",
      expires_at: expiresAt.toISOString()
    }
  });
});

server.post("/verify/confirm", async (request, reply) => {
  let authPayload: { user_id: string; email: string };
  try {
    authPayload = await requireAuth(request);
  } catch {
    return reply.code(401).send({ status: "ERROR", reason: "UNAUTHORIZED" });
  }

  const body = request.body as { verify_intent_id?: string };
  if (!body?.verify_intent_id) {
    return reply.code(400).send({ status: "ERROR", reason: "INVALID_REQUEST" });
  }

  try {
    const result = await confirmVerification({
      prisma,
      userId: authPayload.user_id,
      verifyIntentId: body.verify_intent_id
    });

    return reply.send({
      status: "VERIFIED",
      tx_signature: "MOCK_TX",
      payout: {
        lamports: Number(result.rewardLamports),
        wallet_pubkey: result.walletPubkey ?? "SoL4nA....User"
      },
      code_state: "USED"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return reply.code(400).send({ status: "ERROR", reason: message });
  }

});

server.get("/me", async (_request, reply) => {
  return reply.send({
    user_id: "usr_placeholder",
    email: "user@example.com",
    embedded_wallet: {
      created: true,
      pubkey: "SoL4nA....User"
    },
    rewards: {
      lifetime_lamports: 0
    }
  });
});

server.post("/withdraw/request", async (_request, reply) => {
  return reply.send({
    status: "WITHDRAW_SUBMITTED",
    tx_signature: "tx_placeholder"
  });
});

server.post("/mfg/batches", async (request, reply) => {
  const body = request.body as {
    manufacturer_id?: string;
    sku_code?: string;
    sku_name?: string;
    batch_label?: string;
    expiry_date?: string;
    quantity?: number;
    reward_usd_target?: number;
  };

  if (!body?.manufacturer_id || !body.sku_code || !body.batch_label || !body.quantity) {
    return reply.code(400).send({ status: "ERROR", reason: "INVALID_REQUEST" });
  }
  if (body.quantity <= 0) {
    return reply.code(400).send({ status: "ERROR", reason: "INVALID_QUANTITY" });
  }

  try {
    const result = await createBatchAndPack(prisma, {
      manufacturerId: body.manufacturer_id,
      skuCode: body.sku_code,
      skuName: body.sku_name,
      batchLabel: body.batch_label,
      expiryDate: body.expiry_date,
      quantity: body.quantity,
      rewardUsdTarget: body.reward_usd_target
    });

    return reply.send({
      batch_public_id: result.batch.batchPublicId,
      status: result.batch.status,
      pack_id: result.codePack.packId,
      pack_status: result.codePack.status,
      download_url: result.downloadUrl,
      expires_at: result.expiresAt.toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return reply.code(400).send({ status: "ERROR", reason: message });
  }
});

server.get("/mfg/packs/:pack_id", async (request, reply) => {
  const params = request.params as { pack_id: string };
  const pack = await prisma.codePack.findUnique({
    where: { packId: params.pack_id },
    include: { batch: { include: { sku: true } } }
  });
  if (!pack) {
    return reply.code(404).send({ status: "NOT_FOUND" });
  }
  return reply.send({
    pack_id: pack.packId,
    batch_public_id: pack.batch.batchPublicId,
    status: pack.status,
    download_url: getPackDownloadUrl(pack.packId),
    expires_at: pack.downloadExpiresAt?.toISOString() ?? null
  });
});

server.post("/mfg/packs/:pack_id/confirm-printed", async (request, reply) => {
  const params = request.params as { pack_id: string };
  const pack = await prisma.codePack.findUnique({ where: { packId: params.pack_id } });
  if (!pack) {
    return reply.code(404).send({ status: "NOT_FOUND" });
  }
  await confirmPrinted(prisma, params.pack_id);
  return reply.send({ status: "PRINT_CONFIRMED", plaintext_purged: true });
});

server.post("/mfg/batches/:batch_public_id/activate", async (request, reply) => {
  const params = request.params as { batch_public_id: string };
  const batch = await prisma.batch.findUnique({
    where: { batchPublicId: params.batch_public_id },
    include: { codePacks: true }
  });
  if (!batch) {
    return reply.code(404).send({ status: "NOT_FOUND" });
  }
  const hasPrintedPack = batch.codePacks.some((pack) => pack.printConfirmedAt !== null);
  if (!hasPrintedPack) {
    return reply.code(400).send({ status: "ERROR", reason: "PRINT_NOT_CONFIRMED" });
  }
  const updated = await prisma.batch.update({
    where: { batchPublicId: params.batch_public_id },
    data: {
      status: "ACTIVE",
      activatedAt: new Date(),
      activatedTxSignature: "tx_placeholder"
    }
  });
  return reply.send({ status: updated.status, tx_signature: updated.activatedTxSignature });
});

server.post("/internal/treasury/refill", async (_request, reply) => {
  return reply.send({ status: "REFILL_TRIGGERED" });
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

server.addHook("onClose", async () => {
  await prisma.$disconnect();
});

server.listen({ port, host }).catch((error) => {
  server.log.error(error, "Failed to start server");
  process.exit(1);
});
