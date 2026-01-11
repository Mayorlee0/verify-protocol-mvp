CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "ManufacturerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "BatchStatus" AS ENUM ('CREATED', 'ACTIVE', 'PAUSED', 'CLOSED');
CREATE TYPE "CodePackStatus" AS ENUM ('GENERATING', 'READY', 'DOWNLOADED', 'PRINT_CONFIRMED');
CREATE TYPE "VerifyIntentStatus" AS ENUM ('ISSUED', 'CONFIRMED', 'EXPIRED', 'FAILED');
CREATE TYPE "VerificationResult" AS ENUM ('SUCCESS', 'FAIL');
CREATE TYPE "TreasuryOpType" AS ENUM ('REFILL_SWAP');

CREATE TABLE "Manufacturer" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "status" "ManufacturerStatus" NOT NULL DEFAULT 'ACTIVE',
  "hmacKmsKeyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Sku" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manufacturerId" UUID NOT NULL,
  "skuCode" TEXT NOT NULL,
  "skuName" TEXT NOT NULL,
  "skuHash" BYTEA NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Sku_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Batch" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manufacturerId" UUID NOT NULL,
  "skuId" UUID NOT NULL,
  "batchPublicId" TEXT NOT NULL,
  "batchLabel" TEXT NOT NULL,
  "expiryDate" TIMESTAMP,
  "rewardUsdTarget" DECIMAL(10,2) NOT NULL DEFAULT 0.10,
  "onchainBatchPubkey" TEXT,
  "status" "BatchStatus" NOT NULL DEFAULT 'CREATED',
  "activatedAt" TIMESTAMP,
  "activatedTxSignature" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Batch_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Batch_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Batch_batchPublicId_key" ON "Batch"("batchPublicId");

CREATE TABLE "CodePack" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "packId" TEXT NOT NULL,
  "batchId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "CodePackStatus" NOT NULL DEFAULT 'GENERATING',
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "downloadExpiresAt" TIMESTAMP,
  "downloadedAt" TIMESTAMP,
  "printConfirmedAt" TIMESTAMP,
  "plaintextPurgedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "CodePack_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CodePack_packId_key" ON "CodePack"("packId");

CREATE TABLE "Code" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "packId" UUID NOT NULL,
  "codePlaintext" TEXT,
  "qrPayload" TEXT NOT NULL,
  "commitment" BYTEA NOT NULL,
  "onchainCodePda" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Code_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CodePack"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "privyUserId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_privyUserId_key" ON "User"("privyUserId");

CREATE TABLE "UserWallet" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "chain" TEXT NOT NULL DEFAULT 'solana',
  "walletPubkey" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdAfterFirstSuccess" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "UserWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserWallet_walletPubkey_key" ON "UserWallet"("walletPubkey");

CREATE TABLE "VerifyIntent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "verifyIntentId" TEXT NOT NULL,
  "batchId" UUID NOT NULL,
  "commitment" BYTEA NOT NULL,
  "rewardLamports" BIGINT NOT NULL,
  "status" "VerifyIntentStatus" NOT NULL DEFAULT 'ISSUED',
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "VerifyIntent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VerifyIntent_verifyIntentId_key" ON "VerifyIntent"("verifyIntentId");

CREATE TABLE "Verification" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "batchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "commitment" BYTEA NOT NULL,
  "codePda" TEXT NOT NULL,
  "rewardLamports" BIGINT NOT NULL,
  "txSignature" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP NOT NULL,
  "result" "VerificationResult" NOT NULL,
  "failureReason" TEXT,
  CONSTRAINT "Verification_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Verification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TreasuryOp" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" "TreasuryOpType" NOT NULL,
  "pyusdIn" BIGINT NOT NULL,
  "solOutLamports" BIGINT NOT NULL,
  "jupiterRoute" JSONB NOT NULL,
  "txSignature" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
