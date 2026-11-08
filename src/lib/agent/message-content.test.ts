import test from "node:test";
import assert from "node:assert/strict";
import { appendAppLink, parseMessageContent } from "./message-content";

test("saved navigation Markdown remains a labelled app link after loading", () => {
  const body = "Aquí tienes *GR-03*:\n[Abrir expediente de GR-03](https://rhino.example/gruas/2cfd-1234)";
  const saved = JSON.parse(JSON.stringify({ body })) as { body: string };
  const parts = parseMessageContent(saved.body);
  assert.deepEqual(parts.find((part) => part.type === "link"), {
    type: "link", text: "Abrir expediente de GR-03", href: "https://rhino.example/gruas/2cfd-1234",
  });
  assert.ok(parts.some((part) => part.type === "strong" && part.text === "GR-03"));
});

test("relative app links and bare web links retain their valid target", () => {
  const parts = parseMessageContent("[Ver agenda](/calendario?fecha=2026-11-08). Fuente: https://example.test/manual.pdf.");
  assert.deepEqual(parts.filter((part) => part.type === "link").map((part) => part.href), [
    "/calendario?fecha=2026-11-08", "https://example.test/manual.pdf",
  ]);
  assert.equal(parts.at(-1)?.text, ".");
});

test("unsafe links remain text and cannot become executable or protocol-relative navigation", () => {
  for (const value of ["[Abrir](javascript:alert(1))", "[Abrir](data:text/html,test)", "[Abrir](//evil.test)", "[Abrir](/\\evil.test)", "[Abrir](https://user:pass@example.test)"]) {
    assert.equal(parseMessageContent(value).some((part) => part.type === "link"), false, value);
  }
});

test("plain text and WhatsApp emphasis are preserved without interpreting HTML", () => {
  const parts = parseMessageContent("**Listo**\n_cambio pendiente_ <script>alert(1)</script>");
  assert.deepEqual(parts.slice(0, 3), [
    { type: "strong", text: "Listo" }, { type: "text", text: "\n" }, { type: "em", text: "cambio pendiente" },
  ]);
  assert.equal(parts.at(-1)?.text, " <script>alert(1)</script>");
});

test("tool navigation is saved even when the model omits the link, without duplicates", () => {
  const link = { etiqueta: "Abrir expediente de GR-03", url: "https://rhino.example/gruas/123" };
  const stored = appendAppLink("Aquí tienes el expediente.", link, "https://rhino.example");
  assert.equal(stored, "Aquí tienes el expediente.\n\n[Abrir expediente de GR-03](https://rhino.example/gruas/123)");
  assert.equal(appendAppLink(stored, link, "https://rhino.example"), stored);
  const existing = "[Ver GR-03](/gruas/123)";
  assert.equal(appendAppLink(existing, link, "https://rhino.example"), existing);
});

test("app navigation accepts only a safe link for this application's origin", () => {
  const reply = "No se pudo abrir.";
  for (const url of ["javascript:alert(1)", "//evil.example/gruas/123", "https://evil.example/gruas/123"]) {
    assert.equal(appendAppLink(reply, { etiqueta: "Abrir", url }, "https://rhino.example"), reply);
  }
  assert.equal(appendAppLink(reply, { error: "Sin permiso" }, "https://rhino.example"), reply);
});
