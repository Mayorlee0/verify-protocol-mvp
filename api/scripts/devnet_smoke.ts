import { AnchorProvider, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import crypto from "crypto";
import { buildQrPayload, deriveCommitment, deriveSkuHash, generateCode } from "../src/utils/code.js";

const loadKeypair = (envKey: string) => {
  const raw = process.env[envKey];
  if (!raw) {
    throw new Error(`${envKey}_MISSING`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
};

const loadProgramId = () => {
  const id = process.env.AUTHENTICITY_PROGRAM_ID;
  if (!id) {
    throw new Error("AUTHENTICITY_PROGRAM_ID_MISSING");
  }
  return new PublicKey(id);
};

const loadConnection = () => {
  const url = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  return new Connection(url, "confirmed");
};

const manufacturerSecret = () => {
  const secret = process.env.MANUFACTURER_SECRET;
  if (!secret) {
    throw new Error("MANUFACTURER_SECRET_MISSING");
  }
  return secret;
};

const idl: Idl = {
  version: "0.1.0",
  name: "authenticity_protocol",
  instructions: [
    {
      name: "initialize_manufacturer",
      accounts: [
        { name: "manufacturerPda", isMut: true, isSigner: false },
        { name: "manufacturerAuthority", isMut: false, isSigner: true },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [{ name: "status", type: "u8" }]
    },
    {
      name: "initialize_batch",
      accounts: [
        { name: "batchPda", isMut: true, isSigner: false },
        { name: "manufacturerPda", isMut: false, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "batchPublicId", type: "bytes" },
        { name: "skuHash", type: { array: ["u8", 32] } },
        { name: "rewardUsdTarget", type: "u64" },
        { name: "expiryTs", type: "i64" }
      ]
    },
    {
      name: "initialize_code_state",
      accounts: [
        { name: "codeStatePda", isMut: true, isSigner: false },
        { name: "batchPda", isMut: false, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [{ name: "commitment", type: { array: ["u8", 32] } }]
    },
    {
      name: "initialize_treasury",
      accounts: [
        { name: "treasuryPda", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "solPayoutVault", type: "publicKey" },
        { name: "minSolBufferLamports", type: "u64" }
      ]
    },
    {
      name: "activate_batch",
      accounts: [
        { name: "manufacturerPda", isMut: false, isSigner: false },
        { name: "batchPda", isMut: true, isSigner: false },
        { name: "manufacturerAuthority", isMut: false, isSigner: true }
      ],
      args: []
    },
    {
      name: "verify_and_pay_sol",
      accounts: [
        { name: "manufacturerPda", isMut: false, isSigner: false },
        { name: "batchPda", isMut: false, isSigner: false },
        { name: "codeStatePda", isMut: true, isSigner: false },
        { name: "treasuryPda", isMut: false, isSigner: false },
        { name: "solPayoutVault", isMut: true, isSigner: false },
        { name: "userDestination", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "commitment", type: { array: ["u8", 32] } },
        { name: "rewardLamports", type: "u64" }
      ]
    }
  ]
} as Idl;

const main = async () => {
  const connection = loadConnection();
  const sponsor = loadKeypair("SPONSOR_WALLET_KEYPAIR");
  const manufacturerAuthority = loadKeypair("MANUFACTURER_AUTHORITY_KEYPAIR");
  const programId = loadProgramId();

  const wallet = new Wallet(sponsor);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, programId, provider);

  const batchPublicId = `BATCH_SMOKE_${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const skuCode = "SMOKE_SKU";
  const code = generateCode();
  const qrPayload = buildQrPayload(batchPublicId, code);
  const commitment = deriveCommitment({
    manufacturerSecret: manufacturerSecret(),
    code,
    batchPublicId,
    skuHash: deriveSkuHash(skuCode)
  });

  const [manufacturerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("manufacturer"), manufacturerAuthority.publicKey.toBuffer()],
    programId
  );
  const [batchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("batch"), manufacturerPda.toBuffer(), Buffer.from(batchPublicId)],
    programId
  );
  const [codeStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("code"), batchPda.toBuffer(), commitment],
    programId
  );
  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], programId);

  const solPayoutVault = loadKeypair("SOL_PAYOUT_VAULT_KEYPAIR");

  await connection.requestAirdrop(sponsor.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.requestAirdrop(manufacturerAuthority.publicKey, 1 * LAMPORTS_PER_SOL);

  await program.methods
    .initializeManufacturer(1)
    .accounts({
      manufacturerPda,
      manufacturerAuthority: manufacturerAuthority.publicKey,
      payer: sponsor.publicKey,
      systemProgram: SystemProgram.programId
    })
    .signers([sponsor, manufacturerAuthority])
    .rpc();

  await program.methods
    .initializeTreasury(solPayoutVault.publicKey, 0)
    .accounts({
      treasuryPda,
      payer: sponsor.publicKey,
      systemProgram: SystemProgram.programId
    })
    .signers([sponsor])
    .rpc();

  await program.methods
    .initializeBatch(Buffer.from(batchPublicId), [...deriveSkuHash(skuCode)], 10, 0)
    .accounts({
      batchPda,
      manufacturerPda,
      payer: sponsor.publicKey,
      systemProgram: SystemProgram.programId
    })
    .signers([sponsor])
    .rpc();

  await program.methods
    .initializeCodeState([...commitment])
    .accounts({
      codeStatePda,
      batchPda,
      payer: sponsor.publicKey,
      systemProgram: SystemProgram.programId
    })
    .signers([sponsor])
    .rpc();

  await connection.requestAirdrop(solPayoutVault.publicKey, 1 * LAMPORTS_PER_SOL);

  await program.methods
    .activateBatch()
    .accounts({
      manufacturerPda,
      batchPda,
      manufacturerAuthority: manufacturerAuthority.publicKey
    })
    .signers([manufacturerAuthority])
    .rpc();

  const apiBase = process.env.API_BASE_URL ?? "http://localhost:3000";
  const quoteResponse = await fetch(`${apiBase}/verify/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch_public_id: batchPublicId, code })
  });
  const quote = await quoteResponse.json();
  if (quote.status !== "ELIGIBLE") {
    throw new Error(`Quote failed: ${JSON.stringify(quote)}`);
  }

  const authResponse = await fetch(`${apiBase}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "smoke@example.com", otp: "000000" })
  });
  const auth = await authResponse.json();
  const sessionToken = auth.session_token;

  const confirmResponse = await fetch(`${apiBase}/verify/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ verify_intent_id: quote.verify_intent_id })
  });
  const confirm = await confirmResponse.json();
  if (confirm.status !== "VERIFIED") {
    throw new Error(`Confirm failed: ${JSON.stringify(confirm)}`);
  }

  const codeState = await program.account.codeState.fetch(codeStatePda);
  if (codeState.status !== 1) {
    throw new Error("CodeState not marked USED");
  }

  const userWalletPubkey = new PublicKey(confirm.payout.wallet_pubkey);
  const balance = await connection.getBalance(userWalletPubkey);
  if (balance <= 0) {
    throw new Error("User wallet did not receive lamports");
  }

  console.log("Smoke test passed", { qrPayload, tx: confirm.tx_signature });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
