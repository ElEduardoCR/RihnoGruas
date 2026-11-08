import OpenAI from "openai";
import type { FunctionTool, Response, ResponseInputItem } from "openai/resources/responses/responses";
import { env } from "@/lib/env";

// Todo el acceso al LLM vive aquí: cambiar de proveedor sólo toca este archivo.

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: env.openaiKey }));

export type ChatMessage = ResponseInputItem;
export type ToolSpec = FunctionTool;

const isReasoning = (model: string) => /^(gpt-[56]|o\d)/.test(model);

const responseOptions = (model: string) => ({
  model,
  store: false,
  // Conserva el razonamiento entre herramientas sin guardar la conversación en OpenAI.
  include: ["reasoning.encrypted_content" as const],
  ...(isReasoning(model) ? { reasoning: { effort: env.openaiReasoningEffort } } : {}),
});

function assertComplete(response: Response) {
  if (response.error || response.status !== "completed") {
    const reason = response.error?.message || response.incomplete_details?.reason || response.status || "sin estado";
    throw new Error(`OpenAI no completó la respuesta: ${reason}`);
  }
  if (response.output.some((item) => "status" in item && (item.status === "incomplete" || item.status === "in_progress"))) {
    throw new Error("OpenAI devolvió un elemento incompleto; no se ejecutaron sus herramientas.");
  }
}

function responseRefusal(response: Response) {
  return response.output.flatMap((item) => item.type === "message" ? item.content : [])
    .filter((part) => part.type === "refusal")
    .map((part) => part.refusal)
    .join("\n");
}

function parseStructured<T>(response: Response): T {
  assertComplete(response);
  if (responseRefusal(response)) throw new Error("OpenAI rechazó generar la salida JSON solicitada.");
  if (!response.output_text.trim()) throw new Error("OpenAI no devolvió la salida JSON solicitada.");
  return JSON.parse(response.output_text) as T;
}

export async function chat(messages: ChatMessage[], tools: ToolSpec[], model = env.openaiModel) {
  const res = await openai().responses.create({
    ...responseOptions(model),
    input: messages,
    ...(tools.length ? { tools, tool_choice: "auto" as const } : {}),
  });
  assertComplete(res);
  const refusal = responseRefusal(res);
  const output = res.output.map((item) => {
    // Sólo se ofrecen herramientas de función; otro tipo requiere un manejador propio.
    if (item.type === "message" || item.type === "reasoning" || item.type === "function_call") return item;
    throw new Error(`OpenAI devolvió un elemento no admitido: ${item.type}`);
  });
  return {
    output,
    text: refusal || res.output_text,
    calls: refusal ? [] : output.filter((item) => item.type === "function_call"),
    usage: res.usage,
  };
}

/** Salida estructurada con JSON Schema (modo strict). */
export async function structured<T>(system: string, user: string, name: string, schema: Record<string, unknown>, model = env.openaiModel): Promise<T> {
  const res = await openai().responses.create({
    ...responseOptions(model),
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: { format: { type: "json_schema", name, schema, strict: true } },
  });
  return parseStructured<T>(res);
}

/** Visión: describe/valida una foto de evidencia. */
export async function vision<T>(system: string, prompt: string, imageDataUrl: string, name: string, schema: Record<string, unknown>): Promise<T> {
  const res = await openai().responses.create({
    ...responseOptions(env.openaiVisionModel),
    input: [
      { role: "system", content: system },
      { role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageDataUrl, detail: "low" }] },
    ],
    text: { format: { type: "json_schema", name, schema, strict: true } },
  });
  return parseStructured<T>(res);
}

export async function embed(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({ model: env.openaiEmbeddingModel, input: text });
  return res.data[0].embedding;
}
