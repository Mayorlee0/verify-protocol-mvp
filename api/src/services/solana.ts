import { AnchorProvider, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

const loadSponsorKeypair = () => {
  const raw = process.env.SPONSOR_WALLET_KEYPAIR;
  if (!raw) {
    throw new Error("SPONSOR_WALLET_KEYPAIR_MISSING");
  }
  const secret = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
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

const idl: Idl = {
  version: "0.1.0",
  name: "authenticity_protocol",
  instructions: [
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

export const verifyAndPaySol = async ({
  commitment,
  rewardLamports,
  userDestination,
  manufacturerPda,
  batchPda,
  treasuryPda,
  solPayoutVault
}: {
  commitment: Buffer;
  rewardLamports: bigint;
  userDestination: PublicKey;
  manufacturerPda: PublicKey;
  batchPda: PublicKey;
  treasuryPda: PublicKey;
  solPayoutVault: PublicKey;
}) => {
  const sponsor = loadSponsorKeypair();
  const connection = loadConnection();
  const wallet = new Wallet(sponsor);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const programId = loadProgramId();
  const program = new Program(idl, programId, provider);

  const [codeStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("code"), batchPda.toBuffer(), commitment],
    programId
  );

  const signature = await program.methods
    .verifyAndPaySol([...commitment], rewardLamports)
    .accounts({
      manufacturerPda,
      batchPda,
      codeStatePda,
      treasuryPda,
      solPayoutVault,
      userDestination,
      systemProgram: SystemProgram.programId
    })
    .signers([sponsor])
    .rpc();

  await connection.confirmTransaction(signature, "confirmed");

  return signature;
};
