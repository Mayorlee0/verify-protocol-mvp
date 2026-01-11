import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import {
  activateBatch,
  buildPackCsv,
  confirmPrinted,
  createBatchAndPack
} from "./services/manufacturer.js";
import { startEmailOtp, verifyEmailOtp } from "./services/privy.js";
import { confirmVerification, quoteVerification } from "./services/verification.js";

const server = Fastify({
  logger: {
    redact: {
      paths: [
        "req.headers.authorization",
        "req.body.email",
        "req.body.otp",
        "req.body.code"
      ],
      remove: true
    }
  }
});
const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
server.register(cors, {
  origin: (origin, callback) => {
    if (!origin || corsOrigins.length === 0) {
      callback(null, true);
      return;
    }
    const allowed = corsOrigins.includes(origin);
    callback(null, allowed);
  },
  credentials: true
});
const prisma = new PrismaClient();
const rewardLamports = Number(process.env.DEFAULT_REWARD_LAMPORTS ?? 100000);
const intentTtlSeconds = Number(process.env.CODE_INTENT_TTL_SECONDS ?? 120);
const manufacturerApiKey = process.env.MANUFACTURER_API_KEY;
const demoMode = process.env.DEMO_MODE === "true";

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

const requireManufacturerAuth = (request: { headers: Record<string, string | undefined> }) => {
  if (!manufacturerApiKey) {
    throw new Error("MANUFACTURER_API_KEY_MISSING");
  }
  const key = request.headers["x-api-key"];
  if (!key || key !== manufacturerApiKey) {
    throw new Error("UNAUTHORIZED");
  }
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
  if (isRateLimited(`auth:${request.ip ?? "unknown"}`)) {
    return reply.code(429).send({ status: "ERROR", reason: "RATE_LIMITED" });
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
  if (isRateLimited(`quote:${clientKey}`)) {
    return reply.code(429).send({ status: "NOT_ELIGIBLE", reason: "RATE_LIMITED" });
  }

  try {
    const result = await quoteVerification({
      prisma,
      batchPublicId: body.batch_public_id,
      code: body.code,
      rewardLamports,
      intentTtlSeconds
    });

    return reply.send({
      status: "ELIGIBLE",
      verify_intent_id: result.verifyIntentId,
      reward: {
        usd_target: "0.10",
        lamports: rewardLamports,
        pricing_source: "env_config",
        expires_at: result.expiresAt.toISOString()
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const reason = message === "CODE_USED" ? "CODE_USED" : message;
    return reply.send({ status: "NOT_ELIGIBLE", reason });
  }
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
      tx_signature: result.txSignature,
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

server.get("/health", async (_request, reply) => {
  return reply.send({ status: "ok" });
});

server.get("/version", async (_request, reply) => {
  return reply.send({
    version: process.env.APP_VERSION ?? "dev",
    demo_mode: demoMode
  });
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
      pack_status: result.codePack.status
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
    download_url: `/mfg/packs/${pack.packId}/download`,
    expires_at: pack.downloadExpiresAt?.toISOString() ?? null
  });
});

server.get("/mfg/packs/:pack_id/download", async (request, reply) => {
  try {
    requireManufacturerAuth(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return reply.code(401).send({ status: "ERROR", reason: message });
  }
  const params = request.params as { pack_id: string };
  try {
    const csv = await buildPackCsv(prisma, params.pack_id);
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", `attachment; filename=\"pack_${params.pack_id}.csv\"`);
    return reply.send(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "PLAINTEXT_PURGED") {
      return reply.code(410).send({ status: "ERROR", reason: message });
    }
    return reply.code(404).send({ status: "ERROR", reason: message });
  }
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
  try {
    const updated = await activateBatch(prisma, params.batch_public_id);
    return reply.send({ status: updated.status, tx_signature: updated.activatedTxSignature });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "PRINT_NOT_CONFIRMED" ? 400 : 404;
    return reply.code(status).send({ status: "ERROR", reason: message });
  }
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
