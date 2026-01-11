import { useEffect, useState } from "react";
import { api, getDownloadUrl } from "../../src/lib/api";

export default function MfgDashboard() {
  const [skuCode, setSkuCode] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [batchPublicId, setBatchPublicId] = useState<string | null>(null);
  const [packId, setPackId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch("/api/demo-session");
      const data = await response.json();
      if (!data.authenticated) {
        window.location.href = "/mfg/login";
      }
    };
    checkSession();
  }, []);

  const createPack = async () => {
    setError(null);
    setStatus("Creating batch...");
    try {
      const result = await api.createBatch({
        manufacturer_id: "demo",
        sku_code: skuCode,
        batch_label: batchLabel,
        expiry_date: expiryDate || undefined,
        quantity
      });
      setBatchPublicId(result.batch_public_id);
      setPackId(result.pack_id);
      setStatus("Pack ready");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const confirmPrinted = async () => {
    if (!packId) return;
    setStatus("Confirming printed...");
    try {
      await api.confirmPrinted(packId);
      setStatus("Printed confirmed");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const activateBatch = async () => {
    if (!batchPublicId) return;
    setStatus("Activating batch...");
    try {
      await api.activateBatch(batchPublicId);
      setStatus("Batch activated");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Manufacturer Dashboard</h1>
      <div style={{ display: "grid", gap: 12 }}>
        <input placeholder="SKU code" value={skuCode} onChange={(e) => setSkuCode(e.target.value)} />
        <input
          placeholder="Batch label"
          value={batchLabel}
          onChange={(e) => setBatchLabel(e.target.value)}
        />
        <input
          placeholder="Expiry date (YYYY-MM-DD)"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
        />
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <button onClick={createPack}>Generate Code Pack</button>
      </div>

      {batchPublicId && packId && (
        <section style={{ marginTop: 24 }}>
          <p>Batch: {batchPublicId}</p>
          <p>Pack: {packId}</p>
          <button onClick={() => window.open(getDownloadUrl(packId), "_blank")}>Download CSV</button>
          <button onClick={confirmPrinted} style={{ marginLeft: 8 }}>
            Confirm Printed
          </button>
          <button onClick={activateBatch} style={{ marginLeft: 8 }}>
            Activate Batch
          </button>
        </section>
      )}

      {status && <p>{status}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
