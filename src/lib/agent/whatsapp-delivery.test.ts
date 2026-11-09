import assert from "node:assert/strict";
import test from "node:test";
import { env } from "@/lib/env";
import { demoDb } from "@/lib/db/demo";
import { raiseAlert, sendToPhone } from "@/lib/services/notify";
import { sendDailyBrief } from "./proactive";
import { runAgent } from "./run";
import { toolByName, type ReadTool, type ToolCtx } from "./tools";

let fixtureNumber = 0;
async function fixture() {
  const db = demoDb();
  for (const row of await db.select("staff")) await db.update("staff", row.id, { receives_alerts: false });
  const staff = await db.insert("staff", {
    full_name: "Prueba de entrega", role: "direccion", active: true, can_authorize: true,
    phone: `521999000${String(4000 + fixtureNumber++).padStart(4, "0")}`,
    receives_alerts: true, alert_topics: ["resumen", "checklists"],
  });
  const crane = await db.insert("cranes", { code: `WA-TEST-${fixtureNumber}`, name: "Unidad de prueba", type: "grua_movil", active: true });
  const now = new Date();
  await db.insert("inspections", { crane_id: crane.id, assigned_to: staff.id, title: "Revisión de prueba", kind: "revision_total", status: "programada", scheduled_for: now.toISOString() });
  const ctx: ToolCtx = { db, staff, now, channel: "web" };
  return { db, staff, crane, ctx, now };
}

test("notification callers distinguish failed, simulated and accepted deliveries offline", async (t) => {
  const previous = { token: env.waToken, phoneNumberId: env.waPhoneNumberId, demo: process.env.DEMO_MODE };
  t.after(() => {
    env.waToken = previous.token;
    env.waPhoneNumberId = previous.phoneNumberId;
    if (previous.demo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previous.demo;
  });
  const transport = t.mock.method(globalThis, "fetch", async () => { throw new Error("Network calls are forbidden in this suite"); });
  const revision = toolByName("enviar_revision") as ReadTool;

  for (const mode of ["failed", "simulated", "accepted"] as const) {
    await t.test(mode, async () => {
      delete process.env.DEMO_MODE;
      env.waToken = mode === "accepted" ? "offline-token" : "";
      env.waPhoneNumberId = mode === "accepted" ? "offline-number" : "";
      if (mode === "simulated") process.env.DEMO_MODE = "1";
      let accepted = 0;
      transport.mock.mockImplementation(async (url) => {
        assert.equal(mode, "accepted", "Missing configuration or demo mode must never call Meta");
        assert.match(String(url), /^https:\/\/graph\.facebook\.com\//);
        return Response.json({ messages: [{ id: `wamid.offline-${++accepted}` }] });
      });
      const { db, staff, crane, ctx, now } = await fixture();
      const phone = staff.phone!;

      const result = await sendToPhone(db, phone, "Aviso de prueba", "chat", staff.id);
      assert.equal(result.ok, mode !== "failed");
      assert.equal(Boolean(result.simulated), mode === "simulated");
      assert.equal(Boolean(result.id), mode === "accepted");
      const [outgoing] = await db.select("wa_messages", { eq: { phone, direction: "out" } });
      if (mode === "failed") assert.match(outgoing.body, /envío no confirmado/);
      if (mode === "simulated") assert.match(outgoing.body, /simulación: no enviado por WhatsApp/);
      if (mode === "accepted") assert.equal(outgoing.body, "Aviso de prueba");

      const alert = await raiseAlert(db, { dedupe_key: crypto.randomUUID(), topic: "checklists", severity: "aviso", title: "Prueba", body: "Alerta de prueba" });
      assert.deepEqual(alert?.sent_to, mode === "accepted" ? [phone] : []);
      assert.equal(Boolean(alert?.sent_at), mode === "accepted");
      assert.deepEqual(await sendDailyBrief(db, now), {
        sent: mode === "accepted" ? 1 : 0, failed: mode === "failed" ? 1 : 0, simulated: mode === "simulated" ? 1 : 0,
      });

      if (mode === "failed") await assert.rejects(revision.run({ grua: crane.code }, ctx), /No se confirmó el envío/);
      else {
        const result = await revision.run({ grua: crane.code }, ctx) as Record<string, unknown>;
        assert.equal(result.enviado_a, mode === "accepted" ? staff.full_name : undefined);
        assert.equal(Boolean(result.simulado), mode === "simulated");
      }

      // La respuesta determinista evita llamadas al modelo y no ejecuta operaciones.
      const reply = await runAgent(db, { trigger: "whatsapp", phone, text: "SÍ", now });
      assert.equal(reply.delivery?.ok, mode !== "failed");
      assert.equal(Boolean(reply.delivery?.simulated), mode === "simulated");
      const [run] = await db.select("agent_runs", { eq: { phone } });
      if (mode === "failed") assert.match(run.error ?? "", /Entrega WhatsApp no confirmada/);
      else assert.equal(run.error, null);
      if (mode !== "accepted") assert.equal(accepted, 0);
    });
  }
});
