import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { env } from "./env";
import { markRead, parseWebhook, sendTemplate, sendText, verifySignature } from "./whatsapp";

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

test("outbound messages distinguish explicit demo mode from real API acceptance", async (t) => {
  const previous = { token: env.waToken, phoneNumberId: env.waPhoneNumberId, demo: process.env.DEMO_MODE };
  t.after(() => {
    env.waToken = previous.token;
    env.waPhoneNumberId = previous.phoneNumberId;
    if (previous.demo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previous.demo;
  });
  const unexpectedFetch = () => { throw new Error("Unexpected network request"); };
  const transport = t.mock.method(globalThis, "fetch", unexpectedFetch);

  await t.test("missing credentials fail without implicitly enabling demo mode", async () => {
    delete process.env.DEMO_MODE;
    for (const [token, id] of [["", ""], ["", "test-number"], ["test-token", ""]]) {
      env.waToken = token;
      env.waPhoneNumberId = id;
      const result = await sendText("5219990001122", "Prueba");
      assert.equal(result.ok, false);
      assert.equal(result.simulated, undefined);
      assert.match(result.error ?? "", /no está configurado/);
    }
    assert.equal(transport.mock.callCount(), 0);
  });

  await t.test("explicit demo mode never sends, even if credentials are present", async () => {
    process.env.DEMO_MODE = "1";
    env.waToken = "test-token";
    env.waPhoneNumberId = "test-number";
    assert.deepEqual(await sendText("5219990001122", "Prueba"), { ok: true, simulated: true });
    assert.equal(transport.mock.callCount(), 0);
  });

  delete process.env.DEMO_MODE;
  await t.test("text and template sends require a nonempty Meta message ID", async () => {
    for (const response of [{ success: true }, {}, { messages: [] }, { messages: [{ id: "" }] }, { messages: [{ id: 123 }] }]) {
      transport.mock.mockImplementation(async () => Response.json(response));
      for (const result of [await sendText("5219990001122", "Prueba"), await sendTemplate("5219990001122", "Prueba")]) {
        assert.equal(result.ok, false);
        assert.match(result.error ?? "", /identificador de mensaje/);
      }
    }
    transport.mock.mockImplementation(async () => Response.json({ messages: [{ id: "wamid.test" }] }));
    assert.deepEqual(await sendText("5219990001122", "Prueba"), { ok: true, id: "wamid.test" });
    assert.deepEqual(await sendTemplate("5219990001122", "Prueba"), { ok: true, id: "wamid.test" });
  });

  await t.test("read receipts do not require a new message ID", async () => {
    transport.mock.mockImplementation(async () => Response.json({ success: true }));
    assert.deepEqual(await markRead("wamid.incoming"), { ok: true });
  });

  await t.test("API errors and network failures never report success", async () => {
    transport.mock.mockImplementation(async () => Response.json({ error: { message: "Recipient unavailable" } }, { status: 400 }));
    assert.deepEqual(await sendText("5219990001122", "Prueba"), { ok: false, error: "Recipient unavailable" });
    transport.mock.mockImplementation(unexpectedFetch);
    const result = await sendText("5219990001122", "Prueba");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /No se pudo confirmar/);
  });
});
