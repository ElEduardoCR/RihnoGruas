import "server-only";
import { createHash } from "node:crypto";
import type { Bucket, Db, StoredFile } from "@/lib/db/types";
import type { AgentAttachment, Crane, CraneDocument, DocType, Staff } from "@/lib/types";
import { DOC_LABELS } from "@/lib/labels";
import { env } from "@/lib/env";
import { findCrane } from "./fleet";
import { extractDocument, validateDocumentFile, type DocumentExtraction } from "@/lib/agent/document-extraction";

export class DocumentError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const managerRoles = ["direccion", "administracion"];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const extension = (type: string) => type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg";
const compact = (value: string | null | undefined) => (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const link = (craneId: string) => `${env.appUrl.replace(/\/$/, "")}/gruas/${craneId}#documentos`;
function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new DocumentError(`Indica ${label} válido.`);
  return value.toLowerCase();
}
async function activeStaff(db: Db, staff: Staff, manager = false) {
  const current = await db.get("staff", staff.id);
  if (!staff.active || !current?.active) throw new DocumentError("Tu cuenta no tiene acceso activo a los archivos.");
  if (manager && (!managerRoles.includes(staff.role) || !managerRoles.includes(current.role))) throw new DocumentError("Sólo Dirección o Administración pueden registrar documentos desde el chat.");
  return current;
}
async function ownedConversation(db: Db, staff: Staff, conversationId: string) {
  const conversation = await db.get("agent_conversations", id(conversationId, "una conversación"));
  if (!conversation || conversation.staff_id !== staff.id || conversation.phone !== `web:${staff.id}`) throw new DocumentError("La conversación no está disponible para tu cuenta.");
  return conversation;
}

export async function requireOwnedAttachment(db: Db, staff: Staff, attachmentId: unknown, conversationId?: string) {
  await activeStaff(db, staff);
  const attachment = await db.get("agent_attachments", id(attachmentId, "un archivo adjunto"));
  if (!attachment || attachment.staff_id !== staff.id || (conversationId !== undefined && attachment.conversation_id !== conversationId)) throw new DocumentError("El archivo no está disponible en esta conversación de tu cuenta.");
  await ownedConversation(db, staff, attachment.conversation_id);
  return attachment;
}

async function ensureFile(db: Db, bucket: Bucket, path: string, file: StoredFile, expectedHash: string) {
  const existing = await db.download(bucket, path);
  if (existing) {
    if (hash(existing.bytes) !== expectedHash || existing.contentType !== file.contentType) throw new DocumentError("El archivo guardado no coincide. Adjunta el documento de nuevo.");
    return;
  }
  try { await db.upload(bucket, path, file); }
  catch (error) {
    const concurrent = await db.download(bucket, path);
    if (!concurrent || hash(concurrent.bytes) !== expectedHash || concurrent.contentType !== file.contentType) throw error;
  }
}

export async function createChatAttachment(db: Db, staff: Staff, input: { conversationId: string; uploadId: string; filename: string; contentType: string; bytes: Uint8Array }): Promise<AgentAttachment> {
  await activeStaff(db, staff, true);
  const conversation = await ownedConversation(db, staff, input.conversationId);
  const uploadId = id(input.uploadId, "un identificador de carga");
  try { validateDocumentFile(input.bytes, input.contentType, input.filename); }
  catch (error) { throw new DocumentError(error instanceof Error ? error.message : "Archivo inválido."); }
  const sha256 = hash(input.bytes);
  const existing = await db.get("agent_attachments", uploadId);
  const matches = (row: AgentAttachment) => row.staff_id === staff.id && row.conversation_id === conversation.id && row.sha256 === sha256 && row.content_type === input.contentType;
  if (existing) {
    if (!matches(existing)) throw new DocumentError("Ese identificador de carga ya corresponde a otro archivo. Adjunta el documento de nuevo.");
    return existing;
  }
  const storagePath = `${staff.id}/${conversation.id}/${uploadId}.${extension(input.contentType)}`;
  await ensureFile(db, "chat-adjuntos", storagePath, { bytes: input.bytes, contentType: input.contentType }, sha256);
  try {
    return await db.insert("agent_attachments", {
      id: uploadId, staff_id: staff.id, conversation_id: conversation.id, file_name: input.filename.trim(),
      content_type: input.contentType as AgentAttachment["content_type"], byte_size: input.bytes.byteLength,
      sha256, storage_path: storagePath, extraction: null,
    });
  } catch (error) {
    const concurrent = await db.get("agent_attachments", uploadId);
    if (concurrent && matches(concurrent)) return concurrent;
    throw error;
  }
}

export async function downloadOwnedAttachment(db: Db, staff: Staff, attachmentId: unknown, conversationId?: string) {
  const attachment = await requireOwnedAttachment(db, staff, attachmentId, conversationId);
  const file = await db.download("chat-adjuntos", attachment.storage_path);
  if (!file || file.bytes.byteLength !== attachment.byte_size || file.contentType !== attachment.content_type || hash(file.bytes) !== attachment.sha256) throw new DocumentError("No pude verificar el archivo guardado. Adjunta el documento de nuevo.");
  return { attachment, file };
}

export async function readChatAttachment(db: Db, staff: Staff, attachmentId: unknown) {
  await activeStaff(db, staff, true);
  const { attachment, file } = await downloadOwnedAttachment(db, staff, attachmentId);
  if (attachment.extraction) return { attachment, extraction: attachment.extraction as DocumentExtraction };
  let extraction: DocumentExtraction;
  try { extraction = await extractDocument(file.bytes, attachment.content_type, attachment.file_name); }
  catch { throw new DocumentError("No pude leer el documento. Intenta una foto más clara o indica sus datos en el chat."); }
  const saved = await db.updateWhere("agent_attachments", attachment.id, { extraction }, { staff_id: staff.id, sha256: attachment.sha256, extraction: null });
  if (saved) return { attachment: saved, extraction };
  const current = await requireOwnedAttachment(db, staff, attachment.id);
  if (!current.extraction) throw new DocumentError("No pude guardar la lectura del archivo. Inténtalo de nuevo.");
  return { attachment: current, extraction: current.extraction as DocumentExtraction };
}

export interface DocumentRegistrationInput {
  attachmentId: string;
  crane: string | null;
  docType: DocType | null;
  title: string | null;
  number: string | null;
  issuer: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  coverage: string | null;
  notes: string | null;
}
type DocumentFields = Pick<CraneDocument, "doc_type" | "title" | "number" | "issuer" | "issued_on" | "expires_on" | "coverage" | "notes">;
type CraneIdentity = Pick<Crane, "code" | "plates" | "vin" | "serial_number" | "active">;
interface PreparedDocument { attachmentId: string; sha256: string; craneId: string; craneIdentity: CraneIdentity; fields: DocumentFields }

function text(value: unknown, label: string, max = 500): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new DocumentError(`${label}: indica un texto de 1 a ${max} caracteres o déjalo pendiente.`);
  return value.trim();
}
function date(value: unknown, label: string) {
  const result = text(value, label, 10);
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new DocumentError(`${label}: usa una fecha real YYYY-MM-DD. Si no es legible, déjala pendiente.`);
  return result;
}
function fieldsFrom(input: Partial<DocumentRegistrationInput>, extraction: DocumentExtraction | null): DocumentFields {
  const extractedType = extraction?.doc_type;
  const docType = input.docType ?? (extractedType && Object.hasOwn(DOC_LABELS, extractedType) ? extractedType as DocType : null);
  if (!docType || !Object.hasOwn(DOC_LABELS, docType)) throw new DocumentError("Indica el tipo de documento antes de registrarlo; la lectura no lo identificó con certeza.");
  const issued = date(input.issuedOn ?? extraction?.issued_on, "Fecha de emisión");
  const expires = date(input.expiresOn ?? extraction?.expires_on, "Vencimiento");
  if (issued && expires && expires < issued) throw new DocumentError("El vencimiento es anterior a la emisión. Revisa las fechas antes de confirmar.");
  const notes = text([text(input.notes, "Notas", 2000), extraction?.validity_text ? `Vigencia indicada en el archivo: ${extraction.validity_text}` : null].filter(Boolean).join("\n") || null, "Notas y vigencia", 2000);
  return { doc_type: docType, title: text(input.title ?? extraction?.title ?? DOC_LABELS[docType], "Título", 200)!, number: text(input.number ?? extraction?.number, "Número o folio"), issuer: text(input.issuer ?? extraction?.issuer, "Emisor"), issued_on: issued, expires_on: expires, coverage: text(input.coverage, "Cobertura", 2000), notes };
}

export async function documentCraneCandidates(db: Db, extraction: DocumentExtraction | null) {
  if (!extraction) return [];
  const cranes = await db.select("cranes", { eq: { active: true } });
  const sets = ([['plates', extraction.identity.plates], ['vin', extraction.identity.vin], ['serial_number', extraction.identity.serial_number], ['code', extraction.identity.economic_code]] as const)
    .filter(([, value]) => compact(value))
    .map(([field, value]) => cranes.filter((crane) => compact(crane[field]) === compact(value)))
    .filter((matches) => matches.length);
  if (!sets.length) return [];
  const common = sets[0].filter((crane) => sets.every((matches) => matches.some((candidate) => candidate.id === crane.id)));
  return common.length ? common : [...new Map(sets.flat().map((crane) => [crane.id, crane])).values()];
}

function identityDifferences(extraction: DocumentExtraction | null, crane: Crane) {
  if (!extraction) return [];
  return ([['Placas', extraction.identity.plates, crane.plates], ['VIN', extraction.identity.vin, crane.vin], ['Serie', extraction.identity.serial_number, crane.serial_number], ['Número económico', extraction.identity.economic_code, crane.code]] as const)
    .filter(([, read, registered]) => compact(read) && compact(registered) && compact(read) !== compact(registered))
    .map(([label, read, registered]) => `${label}: archivo ${read}; ficha ${registered}.`);
}

export async function prepareDocumentRegistration(db: Db, staff: Staff, input: DocumentRegistrationInput) {
  await activeStaff(db, staff, true);
  const attachment = await requireOwnedAttachment(db, staff, input.attachmentId);
  if (await db.get("crane_documents", attachment.id)) throw new DocumentError("Este archivo ya está registrado en un expediente. Consulta sus documentos antes de crear otro registro.");
  const extraction = attachment.extraction as DocumentExtraction | null;
  const fields = fieldsFrom(input, extraction);
  const candidates = await documentCraneCandidates(db, extraction);
  const crane = input.crane ? await findCrane(db, text(input.crane, "Unidad")!) : candidates.length === 1 ? candidates[0] : null;
  if (!crane) throw new DocumentError(`Indica una unidad por su código completo para asociar el archivo.${candidates.length ? ` Coinciden: ${candidates.map((row) => row.code).join(", ")}.` : " No encontré una coincidencia única por VIN, placas o número económico."}`);
  const differences = identityDifferences(extraction, crane);
  if (!input.crane && differences.length) throw new DocumentError(`Los identificadores del archivo se contradicen con ${crane.code}: ${differences.join(" ")} Pide al usuario que aclare y elija expresamente el código de unidad antes de preparar su registro.`);
  const craneIdentity: CraneIdentity = { code: crane.code, plates: crane.plates, vin: crane.vin, serial_number: crane.serial_number, active: crane.active };
  return {
    summary: [
      `Registrar *${DOC_LABELS[fields.doc_type]}* en *${crane.code} — ${crane.name}*.`,
      `Archivo: ${attachment.file_name}`,
      `Título: ${fields.title}\nFolio: ${fields.number ?? "pendiente"}\nEmisor: ${fields.issuer ?? "pendiente"}`,
      `Emisión: ${fields.issued_on ?? "pendiente"}\nVencimiento: ${fields.expires_on ?? "no identificado; no se afirma vigencia"}`,
      fields.coverage ? `Cobertura: ${fields.coverage}` : null,
      fields.notes ? `Notas: ${fields.notes}` : null,
      extraction ? `Lectura del archivo: confianza ${extraction.confidence}.${extraction.issues.length ? ` Revisa: ${extraction.issues.join(" ")}` : ""}` : "Datos capturados según lo indicado en el chat; el archivo aún no tiene lectura automática.",
      differences.length ? `Revisa la unidad elegida antes de confirmar: ${differences.join(" ")}` : null,
      "Se agregará el archivo al expediente como un documento nuevo. Los datos de la grúa y documentos anteriores se conservan.",
    ].filter(Boolean).join("\n"),
    args: { attachmentId: attachment.id, sha256: attachment.sha256, craneId: crane.id, craneIdentity, fields } as unknown as Record<string, unknown>,
  };
}

export async function registerPreparedDocument(db: Db, staff: Staff, raw: unknown): Promise<CraneDocument> {
  await activeStaff(db, staff, true);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DocumentError("Prepara de nuevo el registro del documento.");
  const prepared = raw as PreparedDocument;
  const { attachment, file } = await downloadOwnedAttachment(db, staff, prepared.attachmentId);
  if (prepared.sha256 !== attachment.sha256) throw new DocumentError("El archivo cambió desde el resumen. Prepara una nueva propuesta.");
  const crane = await db.get("cranes", id(prepared.craneId, "una unidad"));
  if (!crane?.active || !prepared.craneIdentity || Object.entries(prepared.craneIdentity).some(([key, value]) => crane[key as keyof Crane] !== value)) throw new DocumentError("La unidad cambió desde el resumen. Prepara una nueva propuesta con sus datos actuales.");
  if (!prepared.fields || typeof prepared.fields !== "object") throw new DocumentError("Faltan los datos confirmados del documento.");
  const f = prepared.fields;
  const fields = fieldsFrom({ docType: f.doc_type, title: f.title, number: f.number, issuer: f.issuer, issuedOn: f.issued_on, expiresOn: f.expires_on, coverage: f.coverage, notes: f.notes }, null);
  const row = { id: attachment.id, crane_id: crane.id, ...fields, amount: null, file_path: `${crane.id}/${attachment.id}.${extension(attachment.content_type)}` };
  const matches = (doc: CraneDocument) => Object.entries(row).every(([key, value]) => doc[key as keyof CraneDocument] === value);
  const existing = await db.get("crane_documents", attachment.id);
  if (existing) {
    if (matches(existing)) return existing;
    throw new DocumentError("Este archivo ya se registró con otra propuesta. Revisa el expediente antes de continuar.");
  }
  await ensureFile(db, "documentos", row.file_path, file, attachment.sha256);
  try { return await db.insert("crane_documents", row); }
  catch (error) {
    const concurrent = await db.get("crane_documents", attachment.id);
    if (concurrent && matches(concurrent)) return concurrent;
    if (concurrent) throw new DocumentError("Este archivo ya se registró con otra propuesta. Revisa el expediente antes de continuar.");
    throw error;
  }
}

export function documentResult(document: CraneDocument) {
  const url = link(document.crane_id);
  return { mensaje: `✅ ${document.title} registrado y archivo agregado al expediente. [Ver documentos de la unidad](${url})`, documento_id: document.id, url, etiqueta: "Ver documentos de la unidad" };
}
