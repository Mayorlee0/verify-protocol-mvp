const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });
  const data = (await response.json()) as T;
  if (!response.ok) {
    throw new Error((data as { reason?: string }).reason ?? "REQUEST_FAILED");
  }
  return data;
};

export const api = {
  authStart: (email: string) => request("/auth/start", { method: "POST", body: JSON.stringify({ email }) }),
  authVerify: (email: string, otp: string) =>
    request<{ session_token: string }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email, otp })
    }),
  createBatch: (payload: {
    manufacturer_id: string;
    sku_code: string;
    batch_label: string;
    expiry_date?: string;
    quantity: number;
  }) => request("/mfg/batches", { method: "POST", body: JSON.stringify(payload) }),
  confirmPrinted: (packId: string) => request(`/mfg/packs/${packId}/confirm-printed`, { method: "POST" }),
  activateBatch: (batchPublicId: string) =>
    request(`/mfg/batches/${batchPublicId}/activate`, { method: "POST" }),
  verifyQuote: (batchPublicId: string, code: string) =>
    request("/verify/quote", {
      method: "POST",
      body: JSON.stringify({ batch_public_id: batchPublicId, code })
    }),
  verifyConfirm: (verifyIntentId: string, token: string) =>
    request("/verify/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ verify_intent_id: verifyIntentId })
    })
};

export const getDownloadUrl = (packId: string) => `${API_BASE_URL}/mfg/packs/${packId}/download`;
