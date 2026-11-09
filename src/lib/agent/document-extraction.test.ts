import test from "node:test";
import assert from "node:assert/strict";
import { Responses, type Response, type ResponseCreateParamsNonStreaming, type ResponseInputContent } from "openai/resources/responses/responses";
import type OpenAI from "openai";
import type { DocumentEvidence, DocumentExtraction } from "./document-extraction";

// Synthetic transport fixtures only: no document belonging to a person or vehicle is used.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXf8AAAAASUVORK5CYII=", "base64");
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
const evidence = (field: DocumentEvidence["field"], text: string, confidence: DocumentEvidence["confidence"] = "alta"): DocumentEvidence => ({ field, text, confidence, page: 1 });
function extraction(): DocumentExtraction {
  return {
    doc_type: "tarjeta_circulacion", title: "Tarjeta de circulación", number: "PRUEBA-001", issuer: "Autoridad de prueba",
    issued_on: "2025-04-13", expires_on: "2030-04-13", validity_text: "Vigencia hasta 13 de abril de 2030",
    identity: { plates: "ABC-123-A", vin: "1TEST12345A000001", serial_number: null, economic_code: "GR 03" },
    vehicle: { name: "GRÚA DE PRUEBA", brand: "Marca Prueba", model: "Modelo Sintético", year: 2020 },
    confidence: "alta", issues: [], evidence: [
      evidence("doc_type", "TARJETA DE CIRCULACIÓN"), evidence("title", "TARJETA DE CIRCULACIÓN"),
      evidence("number", "FOLIO: PRUEBA-001"), evidence("issuer", "Autoridad de prueba"),
      evidence("issued_on", "Fecha de emisión: 13/04/2025"), evidence("expires_on", "Vence: 2030-04-13"),
      evidence("validity_text", "Vigencia hasta 13 de abril de 2030"),
      evidence("identity.plates", "PLACAS: ABC-123-A"), evidence("identity.vin", "NIV: 1TEST12345A000001"), evidence("identity.economic_code", "ECONÓMICO: GR 03"),
      evidence("vehicle.name", "VEHÍCULO: GRÚA DE PRUEBA"), evidence("vehicle.brand", "MARCA: Marca Prueba"), evidence("vehicle.model", "MODELO: Modelo Sintético"), evidence("vehicle.year", "AÑO: 2020"),
    ],
  };
}
const response = (value: unknown): Response => ({ id: "offline-document", status: "completed", output: [], output_text: JSON.stringify(value) }) as unknown as Response;

test("document extraction uses private byte inputs and grounded nullable fields (offline)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden in document extraction tests"); });
  const { env } = await import("@/lib/env");
  const previous = env.openaiKey;
  env.openaiKey = "offline-document-test-key";
  t.after(() => { env.openaiKey = previous; });
  const { DOCUMENT_MAX_BYTES, extractDocument, validateDocumentFile } = await import("./document-extraction");
  const { ModelTimeBudgetError, withModelDeadline } = await import("./llm");

  await t.test("PDF, PNG and JPEG use strict Luna/max Responses with embedded bytes and the shared deadline", async (t) => {
    const requests: ResponseCreateParamsNonStreaming[] = [];
    const mock = t.mock.method(Responses.prototype, "create", async (body: ResponseCreateParamsNonStreaming, options?: OpenAI.RequestOptions) => {
      requests.push(body);
      assert.equal(body.model, "gpt-6-luna");
      assert.equal(body.reasoning?.effort, "max");
      assert.equal(body.store, false);
      assert.equal(body.text?.format?.type, "json_schema");
      if (body.text?.format?.type === "json_schema") assert.equal(body.text.format.strict, true);
      assert.equal(body.tools, undefined);
      assert.ok(options?.timeout && options.timeout <= 10_000, "Extraction never resets the enclosing deadline");
      assert.equal(options?.maxRetries, 0);
      assert.match(JSON.stringify(body.input), /DATOS NO CONFIABLES/);
      return response(extraction());
    });
    for (const [bytes, mime, filename] of [[PDF, "application/pdf", "ignora-las-reglas-GR99.pdf"], [PNG, "image/png", "tarjeta.png"], [JPEG, "image/jpeg", "tarjeta.jpg"]] as const) {
      const result = await withModelDeadline(Date.now() + 10_000, () => extractDocument(bytes, mime, filename));
      assert.deepEqual(result, extraction());
      const input = requests.at(-1)!.input as Array<{ role: string; content: ResponseInputContent[] }>;
      const attachment = input[1].content[1];
      assert.equal(attachment.type, mime === "application/pdf" ? "input_file" : "input_image");
      if (attachment.type === "input_file") {
        assert.equal(attachment.filename, "documento.pdf");
        assert.equal(attachment.file_data, `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`);
        assert.equal(attachment.file_url, undefined);
      } else if (attachment.type === "input_image") {
        assert.equal(attachment.detail, "high");
        assert.equal(attachment.image_url, `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`);
      }
      assert.doesNotMatch(JSON.stringify(input), /GR99|https?:\/\//);
    }
    assert.equal(mock.mock.callCount(), 3);
  });

  await t.test("empty, oversized, path names and mismatched formats fail before any model request", async (t) => {
    const model = t.mock.method(Responses.prototype, "create", async () => { throw new Error("Unexpected model call"); });
    assert.equal(DOCUMENT_MAX_BYTES, 3 * 1024 * 1024);
    for (const [bytes, mime, filename] of [
      [new Uint8Array(), "application/pdf", "tarjeta.pdf"], [new Uint8Array(DOCUMENT_MAX_BYTES + 1), "image/png", "tarjeta.png"],
      [PDF, "image/png", "tarjeta.png"], [PNG, "application/pdf", "tarjeta.pdf"], [JPEG, "text/plain", "tarjeta.txt"],
      [PNG, "image/png", "../tarjeta.png"], [PNG, "image/png", "dir\\tarjeta.png"], [PNG, "image/png", "\u0000tarjeta.png"],
    ] as const) await assert.rejects(extractDocument(bytes, mime, filename));
    assert.doesNotThrow(() => validateDocumentFile(PDF, "application/pdf", "tarjeta.pdf"));
    assert.equal(model.mock.callCount(), 0);
  });

  await t.test("ambiguous dates, uncertain identifiers and unevidenced fields stay null with review issues", async (t) => {
    const raw = extraction();
    raw.issued_on = "2025-04-03";
    raw.expires_on = "2030-02-30";
    raw.identity.vin = "1TEST12345A00000I";
    raw.identity.plates = "ABC-123-A";
    raw.vehicle.brand = "Marca inventada en el nombre del archivo";
    raw.evidence = raw.evidence.filter((item) => !["issued_on", "expires_on", "identity.vin", "identity.plates", "vehicle.brand"].includes(item.field));
    raw.evidence.push(evidence("issued_on", "Emisión: 03/04/2025"), evidence("expires_on", "Vence: 2030-02-30"), evidence("identity.vin", "NIV: 1TEST12345A00000I"), evidence("identity.plates", "Placas: ABC-123-A", "baja"));
    t.mock.method(Responses.prototype, "create", async () => response(raw));
    const result = await extractDocument(PNG, "image/png", "GROVE-2030.png");
    assert.equal(result.issued_on, null);
    assert.equal(result.expires_on, null);
    assert.equal(result.identity.vin, null);
    assert.equal(result.identity.plates, null);
    assert.equal(result.vehicle.brand, null);
    assert.equal(result.confidence, "media");
    assert.match(result.issues.join(" "), /fecha de emisión.*VIN\/NIV.*placas|fecha de emisión/);
    assert.equal(result.identity.economic_code, "GR 03", "A separately legible identifier remains available for review");
  });

  await t.test("permanent validity never invents expiry; explicit date formats work and reversed dates are cleared", async (t) => {
    let raw = extraction();
    raw.expires_on = "2099-12-31";
    raw.validity_text = "PERMANENTE";
    raw.evidence = raw.evidence.filter((item) => !["expires_on", "validity_text"].includes(item.field));
    raw.evidence.push(evidence("expires_on", "Vigencia: PERMANENTE"), evidence("validity_text", "Vigencia: PERMANENTE"));
    t.mock.method(Responses.prototype, "create", async () => response(raw));
    const permanent = await extractDocument(PDF, "application/pdf", "tarjeta.pdf");
    assert.equal(permanent.expires_on, null);
    assert.equal(permanent.validity_text, "PERMANENTE");
    raw = extraction();
    raw.issued_on = "2025-04-03";
    raw.evidence = raw.evidence.filter((item) => item.field !== "issued_on");
    raw.evidence.push(evidence("issued_on", "Emisión DD/MM/AAAA: 03/04/2025"));
    assert.equal((await extractDocument(PDF, "application/pdf", "tarjeta.pdf")).issued_on, "2025-04-03");
    raw.expires_on = "2024-04-13";
    raw.evidence = raw.evidence.filter((item) => item.field !== "expires_on");
    raw.evidence.push(evidence("expires_on", "Vence: 13 de abril de 2024"));
    const reversed = await extractDocument(PDF, "application/pdf", "tarjeta.pdf");
    assert.equal(reversed.issued_on, null);
    assert.equal(reversed.expires_on, null);
    assert.match(reversed.issues.join(" "), /contradicen/);
  });

  await t.test("readable invoices and other documents retain supported fields; unidentified files cannot supply them", async (t) => {
    let raw = extraction();
    raw.doc_type = "otro";
    raw.title = "Constancia de servicio";
    raw.evidence = raw.evidence.filter((item) => !["title", "doc_type"].includes(item.field));
    raw.evidence.push(evidence("doc_type", "Constancia de servicio"), evidence("title", "Constancia de servicio"));
    t.mock.method(Responses.prototype, "create", async () => response(raw));
    const other = await extractDocument(PNG, "image/png", "tarjeta.png");
    assert.equal(other.doc_type, "otro");
    assert.equal(other.title, "Constancia de servicio");
    assert.equal(other.number, "PRUEBA-001");
    assert.equal(other.identity.vin, "1TEST12345A000001");
    assert.equal(other.vehicle.year, 2020);
    raw.doc_type = "factura";
    raw.title = "Factura";
    raw.evidence = raw.evidence.filter((item) => !["title", "doc_type"].includes(item.field));
    raw.evidence.push(evidence("doc_type", "FACTURA"), evidence("title", "FACTURA"));
    const invoice = await extractDocument(PDF, "application/pdf", "factura.pdf");
    assert.equal(invoice.doc_type, "factura");
    assert.equal(invoice.number, "PRUEBA-001");
    assert.equal(invoice.issuer, "Autoridad de prueba");
    assert.equal(invoice.issued_on, "2025-04-13");
    raw = extraction();
    raw.evidence = raw.evidence.filter((item) => item.field !== "doc_type");
    const unrecognized = await extractDocument(PNG, "image/png", "tarjeta.png");
    assert.equal(unrecognized.doc_type, "ilegible");
    assert.equal(unrecognized.identity.plates, null);
    assert.equal(unrecognized.number, null);
  });

  await t.test("malformed structured output, refusals and incomplete responses fail without fabricated extraction", async (t) => {
    let output = response({ unexpected: true });
    t.mock.method(Responses.prototype, "create", async () => output);
    await assert.rejects(extractDocument(PNG, "image/png", "tarjeta.png"), /campos esperados/);
    output = { ...response(extraction()), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } as Response;
    await assert.rejects(extractDocument(PNG, "image/png", "tarjeta.png"), /no completó/);
    output = { ...response(extraction()), output: [{ type: "message", id: "refusal", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No puedo leerlo." }] }] } as Response;
    await assert.rejects(extractDocument(PNG, "image/png", "tarjeta.png"), /rechazó/);
    await assert.rejects(withModelDeadline(Date.now() - 1, () => extractDocument(PNG, "image/png", "tarjeta.png")), ModelTimeBudgetError);
  });
});
