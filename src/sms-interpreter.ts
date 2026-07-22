import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const smsInterpretationSchema = z.object({
  kind: z.enum(["task", "request", "context"]),
  taskOrRequest: z.string().trim().min(2).max(160).nullable(),
  durationMinutes: z.number().int().min(5).max(480).nullable(),
  deadline: z.string().trim().min(2).max(80).nullable(),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().trim().min(2).max(160).nullable()
}).strict().superRefine((value, context) => {
  if (value.kind !== "context" && !value.taskOrRequest) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "task or request is required", path: ["taskOrRequest"] });
  }
  if (value.needsClarification && !value.clarificationQuestion) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "clarification question is required", path: ["clarificationQuestion"] });
  }
});

export type SmsInterpretation = z.infer<typeof smsInterpretationSchema>;

const smsTool: Anthropic.Tool = {
  name: "interpret_text",
  description: "Interpret one text message sent to Viv, an AI chief of staff.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["task", "request", "context"] },
      taskOrRequest: { type: ["string", "null"], description: "Concise lowercase task or request, or null for context" },
      durationMinutes: { type: ["integer", "null"], minimum: 5, maximum: 480 },
      deadline: { type: ["string", "null"], description: "Concise user-facing deadline such as tomorrow or friday, or null" },
      needsClarification: { type: "boolean" },
      clarificationQuestion: { type: ["string", "null"], description: "One short lowercase question when clarification is needed" }
    },
    required: ["kind", "taskOrRequest", "durationMinutes", "deadline", "needsClarification", "clarificationQuestion"],
    additionalProperties: false
  }
};

export function validateSmsInterpretation(input: unknown): SmsInterpretation {
  return smsInterpretationSchema.parse(input);
}

export async function interpretSmsWithClaude(message: string, options: {
  apiKey: string;
  model?: string;
}): Promise<SmsInterpretation> {
  const client = new Anthropic({ apiKey: options.apiKey });
  const response = await client.messages.create({
    model: options.model ?? "claude-sonnet-4-5",
    max_tokens: 400,
    system: `You interpret texts for Viv, a calm AI chief of staff. Always call interpret_text once. Use lowercase for taskOrRequest and clarificationQuestion. A clear action is a task. A question or ask is a request. A feeling or life update without an action is context. Capture a duration only when the user explicitly states one; never guess how long a task takes. Capture a deadline only when the user states one. If an actionable task has no duration, set needsClarification true and ask exactly: how long should i set aside? Do not expose reasoning.`,
    messages: [{ role: "user", content: message }],
    tools: [smsTool],
    tool_choice: { type: "tool", name: "interpret_text" }
  });
  const call = response.content.find((block) => block.type === "tool_use" && block.name === "interpret_text");
  if (!call || call.type !== "tool_use") throw new Error("claude did not return a structured interpretation");
  return validateSmsInterpretation(call.input);
}

export function interpretSmsLocally(message: string): SmsInterpretation {
  const normalized = message.trim().toLowerCase().replace(/[’]/g, "'");
  if (/^(i'?m|i am|feeling)\s+(tired|exhausted|overwhelmed|sick|stressed)/.test(normalized)) {
    return { kind: "context", taskOrRequest: null, durationMinutes: null, deadline: null, needsClarification: false, clarificationQuestion: null };
  }
  const minuteMatch = normalized.match(/(\d+)\s*(?:minutes?|mins?)/);
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*hours?/);
  const durationMinutes = minuteMatch ? Number(minuteMatch[1]) : hourMatch ? Number(hourMatch[1]) * 60 : null;
  const deadlineMatch = normalized.match(/\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const taskOrRequest = normalized
    .replace(/\b(?:probably|about|around)?\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?)\b/g, "")
    .replace(/\b(?:sometime\s+)?(?:today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, "")
    .replace(/\s+/g, " ").replace(/[,. ]+$/, "").trim();
  const needsClarification = durationMinutes === null;
  return {
    kind: "task",
    taskOrRequest,
    durationMinutes,
    deadline: deadlineMatch?.[1] ?? null,
    needsClarification,
    clarificationQuestion: needsClarification ? "how long should i set aside?" : null
  };
}
