import Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { z } from "zod";
import type { InterpretedTask } from "./types.js";

const interpretedTaskSchema = z.object({
  title: z.string().trim().min(2).max(140),
  durationMinutes: z.number().int().min(10).max(480).nullable(),
  deadline: z.string().datetime({ offset: true }).nullable(),
  priority: z.enum(["low", "medium", "high"]),
  intent: z.literal("schedule_task")
}).strict();

const taskTool: Anthropic.Tool = {
  name: "schedule_task",
  description: "Capture one clear task that the user wants Viv to schedule.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Concise, action-oriented task title" },
      durationMinutes: { type: ["integer", "null"], minimum: 10, maximum: 480, description: "Stated or reasonably inferred duration; null when truly unknown" },
      deadline: { type: ["string", "null"], description: "ISO 8601 datetime with timezone offset, or null" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      intent: { type: "string", enum: ["schedule_task"] }
    },
    required: ["title", "durationMinutes", "deadline", "priority", "intent"],
    additionalProperties: false
  }
};

export class NeedsMoreDetailError extends Error {
  constructor() { super("tell viv a little more about what you need to get done."); }
}

export function validateClaudeTask(input: unknown): InterpretedTask {
  const result = interpretedTaskSchema.safeParse(input);
  if (!result.success) throw new NeedsMoreDetailError();
  return result.data;
}

export function hasUsableAnthropicKey(value = process.env.ANTHROPIC_API_KEY): boolean {
  return Boolean(value && value.trim() && !value.startsWith("your_"));
}

export async function interpretWithClaude(message: string, options?: {
  apiKey?: string;
  model?: string;
  timeZone?: string;
  now?: DateTime;
}): Promise<InterpretedTask> {
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!hasUsableAnthropicKey(apiKey)) throw new Error("ANTHROPIC_API_KEY is not configured");
  const timeZone = options?.timeZone ?? process.env.TIME_ZONE ?? "America/Los_Angeles";
  const now = (options?.now ?? DateTime.now().setZone(timeZone)).toISO();
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: options?.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    max_tokens: 450,
    system: `You help a chief of staff identify one schedulable task. Current time: ${now}. Time zone: ${timeZone}. Resolve relative dates in that timezone. Use the tool only when there is a clear task. If the message is too vague or is not something to schedule, ask for a little more detail instead of calling the tool. Do not provide hidden reasoning.`,
    messages: [{ role: "user", content: message }],
    tools: [taskTool]
  });
  const call = response.content.find((block) => block.type === "tool_use" && block.name === "schedule_task");
  if (!call || call.type !== "tool_use") throw new NeedsMoreDetailError();
  return validateClaudeTask(call.input);
}
