type PrivyStartResponse = {
  request_id: string;
};

type PrivyVerifyResponse = {
  user_id: string;
  email: string;
};

type PrivyWalletResponse = {
  wallet_pubkey: string;
};

const privyRequest = async <T>(path: string, payload: Record<string, unknown>): Promise<T> => {
  const baseUrl = process.env.PRIVY_BASE_URL ?? "https://auth.privy.io";
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("PRIVY_CONFIG_MISSING");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Privy-App-Id": appId,
      "Privy-App-Secret": appSecret
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("PRIVY_REQUEST_FAILED");
  }

  return (await response.json()) as T;
};

export const startEmailOtp = async (email: string) => {
  return privyRequest<PrivyStartResponse>("/v1/otp/email/start", { email });
};

export const verifyEmailOtp = async (email: string, otp: string) => {
  return privyRequest<PrivyVerifyResponse>("/v1/otp/email/verify", { email, otp });
};

export const createEmbeddedWallet = async (userId: string) => {
  return privyRequest<PrivyWalletResponse>("/v1/wallets/create", { user_id: userId });
};
