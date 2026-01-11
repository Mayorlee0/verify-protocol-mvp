import { describe, expect, it } from "vitest";
import { buildQrPayload, generateCode, validateCode } from "./code.js";

describe("code generation", () => {
  it("generates codes with valid checksum", () => {
    const code = generateCode();
    expect(validateCode(code)).toBe(true);

    const tampered = `${code.slice(0, -1)}A`;
    expect(validateCode(tampered)).toBe(false);
  });

  it("builds QR payload with VFY1 prefix", () => {
    const payload = buildQrPayload("BATCH_123", "ABCD-EFGH-IJKL-MNOP-Q");
    expect(payload).toBe("VFY1|BATCH_123|ABCD-EFGH-IJKL-MNOP-Q");
  });
});
