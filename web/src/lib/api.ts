const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

type RequestOptions = Omit<RequestInit, "body"> & { headers?: Record<string, string> };

export const apiPost = async <T>(path: string, body: unknown, options?: RequestOptions): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    body: JSON.stringify(body),
    ...options
  });
  const data = (await response.json()) as T;
  if (!response.ok) {
    const reason = (data as { reason?: string }).reason ?? "REQUEST_FAILED";
    throw new Error(reason);
  }
  return data;
};

export const apiGet = async <T>(path: string, options?: RequestOptions): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });
  const data = (await response.json()) as T;
  if (!response.ok) {
    const reason = (data as { reason?: string }).reason ?? "REQUEST_FAILED";
    throw new Error(reason);
  }
  return data;
};

export type MfgCreateBatchResponse = {
  batch_public_id: string;
  status: string;
  pack_id: string;
  pack_status: string;
};

export type AuthStartResponse = {
  status: string;
  request_id: string;
};

export type AuthVerifyResponse = {
  status: string;
  session_token: string;
  user_id: string;
  has_embedded_wallet: boolean;
};

type VerifyReward = {
  usd_target: string;
  lamports: number;
  pricing_source: string;
  expires_at: string;
};

export type VerifyQuoteEligible = {
  status: "ELIGIBLE";
  verify_intent_id: string;
  reward: VerifyReward;
};

export type VerifyQuoteNotEligible = {
  status: "NOT_ELIGIBLE";
  reason: string;
};

export type VerifyQuoteResponse = VerifyQuoteEligible | VerifyQuoteNotEligible;

export type VerifyConfirmResponse = {
  status: string;
  tx_signature: string;
  payout: {
    lamports: number;
    wallet_pubkey: string;
  };
  code_state: string;
};

export const api = {
  authStart: (email: string) => apiPost<AuthStartResponse>("/auth/start", { email }),
  authVerify: (email: string, otp: string) => apiPost<AuthVerifyResponse>("/auth/verify", { email, otp }),
  createBatch: (payload: {
    manufacturer_id: string;
    sku_code: string;
    batch_label: string;
    expiry_date?: string;
    quantity: number;
  }) => apiPost<MfgCreateBatchResponse>("/mfg/batches", payload),
  confirmPrinted: (packId: string) => apiPost<{ status: string }>(`/mfg/packs/${packId}/confirm-printed`, {}),
  activateBatch: (batchPublicId: string) =>
    apiPost<{ status: string; tx_signature?: string }>(`/mfg/batches/${batchPublicId}/activate`, {}),
  verifyQuote: (batchPublicId: string, code: string) =>
    apiPost<VerifyQuoteResponse>("/verify/quote", { batch_public_id: batchPublicId, code }),
  verifyConfirm: (verifyIntentId: string, token: string) =>
    apiPost<VerifyConfirmResponse>(
      "/verify/confirm",
      { verify_intent_id: verifyIntentId },
      { headers: { Authorization: `Bearer ${token}` } }
    )
};

export const getDownloadUrl = (packId: string) => `${API_BASE_URL}/mfg/packs/${packId}/download`;
