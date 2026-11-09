import test from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "@/lib/db/demo";
import type { Db } from "@/lib/db/types";
import type { Crane, Staff } from "@/lib/types";
import { createChatAttachment, downloadOwnedAttachment, prepareDocumentRegistration, readChatAttachment, registerPreparedDocument, requireOwnedAttachment, type DocumentRegistrationInput } from "@/lib/services/agent-documents";
import type { DocumentExtraction } from "./document-extraction";
import { toolByName, toolsFor, type ToolCtx, type WriteTool } from "./tools";
import { runAgent } from "./run";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
const now = new Date("2026-11-09T20:00:00.000Z");
const registration = toolByName("registrar_documento") as WriteTool;
const emptyArgs = { adjunto_id: null, grua: null, tipo_documento: null, titulo: null, numero: null, emisor: null, fecha_emision: null, fecha_vencimiento: null, cobertura: null, notas: null };

async function fixture(role: Staff["role"] = "direccion") {
  const db = demoDb();
  const suffix = crypto.randomUUID().slice(0, 8);
  const staff = await db.insert("staff", { full_name: "Prueba documento", role, active: true, phone: null });
  const conversation = await db.insert("agent_conversations", { staff_id: staff.id, phone: `web:${staff.id}` });
  const crane = await db.insert("cranes", { code: `QA-${suffix}`, name: "Grúa de prueba", active: true, type: "vehiculo_apoyo", plates: `P${suffix}`, vin: `VIN${suffix}`, serial_number: null, capacity_tons: null });
  const upload = { conversationId: conversation.id, uploadId: crypto.randomUUID(), filename: "tarjeta.pdf", contentType: "application/pdf", bytes: PDF };
  const input: DocumentRegistrationInput = { attachmentId: upload.uploadId, crane: null, docType: null, title: null, number: null, issuer: null, issuedOn: null, expiresOn: null, coverage: null, notes: null };
  const ctx: ToolCtx = { db, staff, channel: "web", now, conversationId: conversation.id, attachmentId: upload.uploadId };
  return { db, staff, crane, conversation, upload, input, ctx };
}
function reading(crane: Crane): DocumentExtraction {
  return { doc_type: "tarjeta_circulacion", title: "Tarjeta de circulación", number: "DOC-PRUEBA", issuer: "Emisor de prueba", issued_on: "2025-01-20", expires_on: null, validity_text: "PERMANENTE", identity: { plates: crane.plates, vin: crane.vin, serial_number: null, economic_code: crane.code }, vehicle: { name: null, brand: null, model: null, year: null }, confidence: "alta", issues: [], evidence: [] };
}
async function savedFixture() {
  const f = await fixture();
  const attachment = await createChatAttachment(f.db, f.staff, f.upload);
  await f.db.update("agent_attachments", attachment.id, { extraction: reading(f.crane) });
  return { ...f, attachment };
}

test("chat uploads enforce active management, private conversation ownership and actual file type", async () => {
  const f = await fixture();
  const other = await fixture("operador");
  await assert.rejects(createChatAttachment(other.db, other.staff, other.upload), /Dirección o Administración/);
  await assert.rejects(createChatAttachment(f.db, f.staff, { ...f.upload, conversationId: other.conversation.id }), /no está disponible/);
  await assert.rejects(createChatAttachment(f.db, f.staff, { ...f.upload, bytes: Buffer.from("not a PDF") }), /válido/);
  await assert.rejects(createChatAttachment(f.db, f.staff, { ...f.upload, bytes: new Uint8Array(3 * 1024 * 1024 + 1) }), /3 MiB/);
  await assert.rejects(createChatAttachment(f.db, f.staff, { ...f.upload, filename: "../archivo.pdf" }), /nombre/);
  await f.db.update("staff", f.staff.id, { active: false });
  await assert.rejects(createChatAttachment(f.db, f.staff, f.upload), /acceso activo/);
  assert.equal(await f.db.get("agent_attachments", f.upload.uploadId), null);
});

test("upload retries are idempotent and concurrent different bytes never replace a stored file", async () => {
  const f = await fixture();
  const attempts = await Promise.all([createChatAttachment(f.db, f.staff, f.upload), createChatAttachment(f.db, f.staff, f.upload)]);
  assert.equal(attempts[0].id, attempts[1].id);
  assert.equal((await f.db.select("agent_attachments", { eq: { id: f.upload.uploadId } })).length, 1);
  await assert.rejects(createChatAttachment(f.db, f.staff, { ...f.upload, bytes: Buffer.concat([PDF, Buffer.from("different")]) }), /otro archivo/);
  assert.deepEqual((await downloadOwnedAttachment(f.db, f.staff, f.upload.uploadId)).file.bytes, PDF);
  const raceId = crypto.randomUUID();
  const race = await Promise.allSettled([
    createChatAttachment(f.db, f.staff, { ...f.upload, uploadId: raceId }),
    createChatAttachment(f.db, f.staff, { ...f.upload, uploadId: raceId, bytes: Buffer.concat([PDF, Buffer.from("different")]) }),
  ]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  await downloadOwnedAttachment(f.db, f.staff, raceId);
});

test("old attachments remain readable only by their active owner and cannot enter another current chat", async () => {
  const f = await savedFixture();
  const other = await fixture();
  const newer = await f.db.insert("agent_conversations", { staff_id: f.staff.id, phone: `web:${f.staff.id}` });
  await assert.rejects(requireOwnedAttachment(f.db, other.staff, f.attachment.id), /no está disponible/);
  await assert.rejects(requireOwnedAttachment(f.db, f.staff, f.attachment.id, newer.id), /no está disponible/);
  assert.equal((await readChatAttachment(f.db, f.staff, f.attachment.id)).extraction.number, "DOC-PRUEBA");
  await f.db.update("staff", f.staff.id, { active: false });
  await assert.rejects(requireOwnedAttachment(f.db, f.staff, f.attachment.id), /acceso activo/);
});

test("document registration prepares a complete review without writing the dossier or asserting permanent validity", async () => {
  const f = await savedFixture();
  const prepared = await registration.prepare(emptyArgs, f.ctx);
  assert.match(prepared.summary, new RegExp(f.crane.code));
  assert.match(prepared.summary, /PERMANENTE/);
  assert.match(prepared.summary, /no identificado; no se afirma vigencia/);
  assert.equal(await f.db.get("crane_documents", f.attachment.id), null);
  const document = await registerPreparedDocument(f.db, f.staff, prepared.args);
  assert.equal(document.crane_id, f.crane.id);
  assert.equal(document.expires_on, null);
  assert.equal(document.coverage, null);
  assert.equal(document.amount, null);
  assert.equal(document.doc_type, "tarjeta_circulacion");
  assert.deepEqual(await f.db.get("cranes", f.crane.id), f.crane);
  assert.deepEqual((await f.db.download("documentos", document.file_path!))?.bytes, PDF);
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, f.input), /ya está registrado/);
});

test("conflicting identifiers require the user to explicitly select the unit even when only the plates match", async () => {
  const f = await savedFixture();
  const extraction = reading(f.crane);
  extraction.identity.vin = "VIN-NO-REGISTRADO";
  await f.db.update("agent_attachments", f.attachment.id, { extraction });
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, f.input), /se contradicen.*VIN.*elija expresamente/);
  const prepared = await prepareDocumentRegistration(f.db, f.staff, { ...f.input, crane: f.crane.code });
  assert.match(prepared.summary, /Revisa la unidad elegida.*VIN-NO-REGISTRADO/);
  const second = await f.db.insert("cranes", { code: `OTRO-${crypto.randomUUID()}`, name: "Otra unidad", plates: f.crane.plates, vin: extraction.identity.vin, serial_number: null, active: true });
  extraction.identity.economic_code = null;
  extraction.identity.vin = null;
  await f.db.update("agent_attachments", f.attachment.id, { extraction });
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, f.input), /código completo/);
  assert.notEqual(second.id, f.crane.id);
});

test("missing type or unit and impossible dates return clarification instead of a proposal", async () => {
  const f = await fixture();
  await createChatAttachment(f.db, f.staff, f.upload);
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, f.input), /tipo de documento/);
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, { ...f.input, docType: "tarjeta_circulacion" }), /código completo/);
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, { ...f.input, crane: f.crane.code, docType: "tarjeta_circulacion", issuedOn: "2025-02-30" }), /fecha real/);
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, { ...f.input, crane: f.crane.code, docType: "tarjeta_circulacion", issuedOn: "2025-02-20", expiresOn: "2025-01-20" }), /anterior/);
  assert.equal(await f.db.get("crane_documents", f.upload.uploadId), null);
});

test("other supported dossier document types use the same review without inventing coverage", async () => {
  const f = await savedFixture();
  await assert.rejects(prepareDocumentRegistration(f.db, f.staff, { ...f.input, notes: "x".repeat(2000) }), /Notas y vigencia/);
  for (const docType of ["seguro", "manual", "otro"] as const) {
    const extraction = { ...reading(f.crane), doc_type: docType, title: `Documento ${docType}` };
    await f.db.update("agent_attachments", f.attachment.id, { extraction });
    const prepared = await prepareDocumentRegistration(f.db, f.staff, f.input);
    const fields = prepared.args.fields as { doc_type: string; coverage: string | null };
    assert.equal(fields.doc_type, docType);
    assert.equal(fields.coverage, null);
    assert.equal(await f.db.get("crane_documents", f.attachment.id), null);
  }
});

test("confirmation rechecks permissions, crane identity and the attachment hash", async () => {
  const f = await savedFixture();
  const prepared = await prepareDocumentRegistration(f.db, f.staff, f.input);
  await f.db.update("staff", f.staff.id, { role: "operador" });
  await assert.rejects(registerPreparedDocument(f.db, f.staff, prepared.args), /Dirección o Administración/);
  await f.db.update("staff", f.staff.id, { role: "direccion" });
  await f.db.update("cranes", f.crane.id, { plates: "CAMBIO" });
  await assert.rejects(registerPreparedDocument(f.db, f.staff, prepared.args), /unidad cambió/);
  await f.db.update("cranes", f.crane.id, { plates: f.crane.plates });
  const tampered: Db = { ...f.db, download: async () => ({ bytes: Buffer.concat([PDF, Buffer.from("tamper")]), contentType: "application/pdf" }) };
  await assert.rejects(registerPreparedDocument(tampered, f.staff, prepared.args), /verificar el archivo/);
  assert.equal(await f.db.get("crane_documents", f.attachment.id), null);
});

test("duplicate document confirmations are idempotent and competing proposals produce one dossier row", async () => {
  const f = await savedFixture();
  const prepared = await prepareDocumentRegistration(f.db, f.staff, f.input);
  const [first, retry] = await Promise.all([registerPreparedDocument(f.db, f.staff, prepared.args), registerPreparedDocument(f.db, f.staff, prepared.args)]);
  assert.equal(first.id, retry.id);
  const g = await savedFixture();
  const a = await prepareDocumentRegistration(g.db, g.staff, { ...g.input, title: "Propuesta A" });
  const b = await prepareDocumentRegistration(g.db, g.staff, { ...g.input, title: "Propuesta B" });
  const result = await Promise.allSettled([registerPreparedDocument(g.db, g.staff, a.args), registerPreparedDocument(g.db, g.staff, b.args)]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal((await g.db.select("crane_documents", { eq: { id: g.attachment.id } })).length, 1);
});

test("visible proposal ID and SÍ gate file association across new chat sessions", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden in document tests"); });
  const f = await savedFixture();
  const prepared = await registration.prepare(emptyArgs, f.ctx);
  const pending = await f.db.insert("agent_pending_actions", { phone: `web:${f.staff.id}`, staff_id: f.staff.id, tool: registration.name, args: prepared.args, summary: prepared.summary, status: "pendiente", expires_at: "2026-11-09T20:30:00Z", resolved_at: null, result: null });
  const newer = await f.db.insert("agent_conversations", { staff_id: f.staff.id, phone: `web:${f.staff.id}` });
  const input = { phone: `web:${f.staff.id}`, staffId: f.staff.id, conversationId: newer.id, text: "SÍ", trigger: "web" as const, now };
  const stale = await runAgent(f.db, { ...input, expectedPendingId: crypto.randomUUID() });
  assert.match(stale.reply, /propuesta pendiente cambió/);
  assert.equal(await f.db.get("crane_documents", f.attachment.id), null);
  const saved = await runAgent(f.db, { ...input, expectedPendingId: pending.id });
  assert.match(saved.reply, /registrado y archivo agregado/);
  assert.match(saved.reply, /Ver documentos de la unidad/);
  assert.equal((await f.db.get("agent_pending_actions", pending.id))?.status, "confirmada");
  assert.equal((await f.db.get("crane_documents", f.attachment.id))?.crane_id, f.crane.id);
  assert.ok(toolsFor(f.staff).some((tool) => tool.name === "registrar_documento"));
  assert.equal(toolsFor({ ...f.staff, role: "operador" }).some((tool) => ["registrar_documento", "consultar_archivo"].includes(tool.name)), false);
});
