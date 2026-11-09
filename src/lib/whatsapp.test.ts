import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { env } from "./env";
import { parseWebhook, verifySignature } from "./whatsapp";

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

const incomingChange = (id: string, phoneNumberId?: string) => ({
  field: "messages",
  value: {
    ...(phoneNumberId === undefined ? {} : { metadata: { phone_number_id: phoneNumberId } }),
    contacts: [{ wa_id: "5219990001122", profile: { name: "Prueba" } }],
    messages: [{ id, from: "5219990001122", timestamp: "1794240000", type: "text", text: { body: "Hola Rhino" } }],
  },
});

test("processes only messages addressed to the configured WhatsApp number", () => {
  const payload = {
    entry: [{ changes: [incomingChange("other", "other-number"), incomingChange("rhino", "rhino-number")] }],
  };
  assert.deepEqual(parseWebhook(payload, "rhino-number"), [{
    id: "rhino", from: "5219990001122", name: "Prueba", text: "Hola Rhino", type: "text", mediaId: null,
    timestamp: 1794240000000,
  }]);
});

test("ignores messages without a verifiable destination when a WhatsApp number is configured", () => {
  const payload = { entry: [{ changes: [incomingChange("missing"), incomingChange("empty", "")] }] };
  assert.deepEqual(parseWebhook(payload, "rhino-number"), []);
});

test("keeps payloads without metadata readable when no WhatsApp number is configured", () => {
  const payload = { entry: [{ changes: [incomingChange("legacy")] }] };
  assert.deepEqual(parseWebhook(payload, "").map((message) => message.id), ["legacy"]);
});
