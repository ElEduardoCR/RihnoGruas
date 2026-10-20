import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "@/lib/env";

// Todo el acceso al LLM vive aquí: cambiar de proveedor sólo toca este archivo.

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: env.openaiKey }));

export type ChatMessage = ChatCompletionMessageParam;
export type ToolSpec = ChatCompletionTool;

const isReasoning = (model: string) => /^(gpt-5|o\d)/.test(model);

export async function chat(messages: ChatMessage[], tools: ToolSpec[], model = env.openaiModel) {
  const res = await openai().chat.completions.create({
    model,
    messages,
    ...(tools.length ? { tools, tool_choice: "auto" as const } : {}),
    ...(isReasoning(model) ? { reasoning_effort: (process.env.OPENAI_REASONING_EFFORT || "low") as "low" } : {}),
  });
  return { message: res.choices[0].message, usage: res.usage };
}

/** Salida estructurada con JSON Schema (modo strict). */
export async function structured<T>(system: string, user: string, name: string, schema: Record<string, unknown>, model = env.openaiModel): Promise<T> {
  const res = await openai().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
    ...(isReasoning(model) ? { reasoning_effort: "low" as const } : {}),
  });
  return JSON.parse(res.choices[0].message.content ?? "{}") as T;
}

/** Visión: describe/valida una foto de evidencia. */
export async function vision<T>(system: string, prompt: string, imageDataUrl: string, name: string, schema: Record<string, unknown>): Promise<T> {
  const res = await openai().chat.completions.create({
    model: env.openaiVisionModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } }] },
    ],
    response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
    ...(isReasoning(env.openaiVisionModel) ? { reasoning_effort: "low" as const } : {}),
  });
  return JSON.parse(res.choices[0].message.content ?? "{}") as T;
}

export async function embed(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({ model: env.openaiEmbeddingModel, input: text });
  return res.data[0].embedding;
}
