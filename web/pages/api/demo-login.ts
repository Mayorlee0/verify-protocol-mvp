import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "ERROR", reason: "METHOD_NOT_ALLOWED" });
  }
  const { password } = req.body as { password?: string };
  const expected = process.env.DEMO_MFG_PASSWORD;
  if (!expected) {
    return res.status(500).json({ status: "ERROR", reason: "DEMO_MFG_PASSWORD_MISSING" });
  }
  if (!password || password !== expected) {
    return res.status(401).json({ status: "ERROR", reason: "INVALID_PASSWORD" });
  }
  res.setHeader("Set-Cookie", "mfg_demo=1; Path=/; HttpOnly; SameSite=Lax");
  return res.status(200).json({ status: "OK" });
}
