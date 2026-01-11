import { useState } from "react";
import { api } from "../src/lib/api";

const parseQr = (payload: string) => {
  const parts = payload.split("|");
  if (parts.length !== 3 || parts[0] !== "VFY1") {
    return null;
  }
  return { batchPublicId: parts[1], code: parts[2] };
};

export default function VerifyPage() {
  const [qrPayload, setQrPayload] = useState("");
  const [batchPublicId, setBatchPublicId] = useState("");
  const [code, setCode] = useState("");
  const [verifyIntentId, setVerifyIntentId] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [result, setResult] = useState<{ wallet_pubkey?: string; tx_signature?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleQuote = async () => {
    setError(null);
    const parsed = qrPayload ? parseQr(qrPayload) : null;
    const batch = parsed?.batchPublicId ?? batchPublicId;
    const codeValue = parsed?.code ?? code;
    try {
      const response = await api.verifyQuote(batch, codeValue);
      setEligibility(response.status);
      if (response.status === "ELIGIBLE") {
        setVerifyIntentId(response.verify_intent_id);
      } else {
        setVerifyIntentId(null);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAuthStart = async () => {
    setError(null);
    try {
      await api.authStart(email);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAuthVerify = async () => {
    setError(null);
    try {
      const response = await api.authVerify(email, otp);
      setSessionToken(response.session_token);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConfirm = async () => {
    if (!verifyIntentId || !sessionToken) return;
    setError(null);
    try {
      const response = await api.verifyConfirm(verifyIntentId, sessionToken);
      setResult({ wallet_pubkey: response.payout.wallet_pubkey, tx_signature: response.tx_signature });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const rewardPending = result?.tx_signature?.startsWith("DEMO_") ||
    result?.tx_signature?.startsWith("MOCK_");

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Verify Product</h1>
      <section style={{ display: "grid", gap: 12 }}>
        <textarea
          placeholder="QR payload (VFY1|batch|code)"
          value={qrPayload}
          onChange={(event) => setQrPayload(event.target.value)}
        />
        <input
          placeholder="Batch public id"
          value={batchPublicId}
          onChange={(event) => setBatchPublicId(event.target.value)}
        />
        <input placeholder="Code" value={code} onChange={(event) => setCode(event.target.value)} />
        <button onClick={handleQuote}>Check Code</button>
        {eligibility && <p>Eligibility: {eligibility}</p>}
        {verifyIntentId && <p>Verify Intent: {verifyIntentId}</p>}
      </section>

      <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <h2>Email OTP</h2>
        <input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <button onClick={handleAuthStart}>Send OTP</button>
        <input placeholder="OTP" value={otp} onChange={(event) => setOtp(event.target.value)} />
        <button onClick={handleAuthVerify}>Verify OTP</button>
      </section>

      <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <button onClick={handleConfirm} disabled={!sessionToken || !verifyIntentId}>
          Confirm Verification
        </button>
        {result && (
          <div>
            <p>Wallet: {result.wallet_pubkey}</p>
            <p>Tx: {result.tx_signature}</p>
            {rewardPending && <p>Reward Pending (Mock)</p>}
          </div>
        )}
      </section>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
