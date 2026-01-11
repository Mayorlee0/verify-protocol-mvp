import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookie = req.headers.cookie ?? "";
  const authenticated = cookie.includes("mfg_demo=1");
  return res.status(200).json({ authenticated });
}
