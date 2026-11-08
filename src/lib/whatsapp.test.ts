import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { env } from "./env";
import { verifySignature } from "./whatsapp";

const TEST_SECRET = "whatsapp-signature-test-secret";
const BODY = '{"object":"whatsapp_business_account","entry":[]}';
const SIGNATURE = `sha256=${createHmac("sha256", TEST_SECRET).update(BODY).digest("hex")}`;

function withSecret(secret: string, run: () => void) {
  const previous = env.waAppSecret;
  env.waAppSecret = secret;
  try {
    run();
  } finally {
    env.waAppSecret = previous;
  }
}

test("public webhook rejects requests when the app secret is not configured", () => {
  withSecret("", () => {
    assert.equal(verifySignature(BODY, null), false);
    assert.equal(verifySignature(BODY, SIGNATURE), false);
  });
});

test("authenticates the exact body signed by the configured Meta app", () => {
  withSecret(TEST_SECRET, () => {
    assert.equal(verifySignature(BODY, SIGNATURE), true);
    assert.equal(verifySignature(`${BODY}\n`, SIGNATURE), false);
    assert.equal(verifySignature(BODY.replace("entry", "messages"), SIGNATURE), false);
  });
  withSecret("another-app-secret", () => {
    assert.equal(verifySignature(BODY, SIGNATURE), false);
  });
});

test("rejects missing, incomplete, or malformed signatures without throwing", () => {
  withSecret(TEST_SECRET, () => {
    for (const header of [
      null,
      "",
      SIGNATURE.replace("sha256=", "sha1="),
      "sha256=",
      SIGNATURE.slice(0, -1),
      `${SIGNATURE}00`,
      `${SIGNATURE}invalid`,
      `${SIGNATURE} `,
      `sha256=${"z".repeat(64)}`,
      `sha256=${"0".repeat(64)}`,
    ]) {
      assert.equal(verifySignature(BODY, header), false);
    }
  });
});
