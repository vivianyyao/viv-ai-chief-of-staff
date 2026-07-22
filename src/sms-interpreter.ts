import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const smsInterpretationSchema = z.object({
  kind: z.enum(["task", "request", "context"]),
  taskOrRequest: z.string().trim().min(2).max(160).nullable(),
  durationMinutes: z.number().int().min(5).max(480).nullable(),
  deadline: z.string().trim().min(2).max(80).nullable(),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().trim().min(2).max(160).nullable(),
  availabilityProvided: z.boolean().optional(),
  proposedTime: z.string().trim().min(2).max(100).nullable().optional(),
  recommendationReason: z.string().trim().min(2).max(280).nullable().optional(),
  shouldAddToPlan: z.boolean().optional(),
  planItemTitle: z.string().trim().min(2).max(120).nullable().optional(),
  planItemDate: z.string().trim().min(2).max(40).nullable().optional(),
  planItemStart: z.string().trim().min(2).max(20).nullable().optional(),
  planItemEnd: z.string().trim().min(2).max(20).nullable().optional()
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
      clarificationQuestion: { type: ["string", "null"], description: "One short lowercase question when clarification is needed" },
      availabilityProvided: { type: "boolean", description: "True when the newest message manually provides any schedule commitment, busy time, or free time" },
      proposedTime: { type: ["string", "null"], description: "A concise lowercase proposed time block based only on availability the user supplied, or null" },
      recommendationReason: { type: ["string", "null"], description: "One calm lowercase sentence explaining why the proposed block fits, or null" },
      shouldAddToPlan: { type: "boolean", description: "True when the user states a definite existing commitment with enough timing detail for the local plan, or explicitly asks to add one" },
      planItemTitle: { type: ["string", "null"], description: "Short lowercase commitment title for the local plan, or null" },
      planItemDate: { type: ["string", "null"], description: "User-facing date such as today or tomorrow, or null" },
      planItemStart: { type: ["string", "null"], description: "24-hour local start time in HH:MM format, or null" },
      planItemEnd: { type: ["string", "null"], description: "24-hour local end time in HH:MM format, or null" }
    },
    required: ["kind", "taskOrRequest", "durationMinutes", "deadline", "needsClarification", "clarificationQuestion", "availabilityProvided", "proposedTime", "recommendationReason", "shouldAddToPlan", "planItemTitle", "planItemDate", "planItemStart", "planItemEnd"],
    additionalProperties: false
  }
};

export function validateSmsInterpretation(input: unknown): SmsInterpretation {
  return smsInterpretationSchema.parse(input);
}

export async function interpretSmsWithClaude(message: string, options: {
  apiKey: string;
  model?: string;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<SmsInterpretation> {
  const client = new Anthropic({ apiKey: options.apiKey });
  const response = await client.messages.create({
    model: options.model ?? "claude-sonnet-4-5",
    max_tokens: 400,
    system: `You interpret texts for Viv, a calm AI chief of staff. Always call interpret_text once. Use lowercase throughout. A clear action is a task. A question or ask is a request. A feeling or life update without an action is context. Capture a duration only when the user explicitly states one; never guess how long a task takes. Distinguish the duration of an event from the duration of a task preparing for that event: "prep for a 30-minute interview" does not mean the prep takes 30 minutes. Capture the task deadline only when stated. For preparation, an event start is the deadline: "prep for an interview tomorrow at 10:30" means the task is due before tomorrow at 10:30. If an actionable task has no duration, set needsClarification true and ask exactly: how long should i set aside? When conversation history is provided, use relevant earlier details, but classify the newest message by what it contributes. If the newest message only supplies a calendar commitment, busy time, or free time for an existing scheduling conversation, classify it as context, set taskOrRequest null, set availabilityProvided true, and do not repeat the earlier task. Extract a described commitment into planItemTitle, planItemDate, planItemStart, and planItemEnd when those details are known. Set shouldAddToPlan true when the user states a definite existing commitment with a date, start, and end, because the plan is only a reversible local preview. Also set it true when a follow-up says to add it, put it, or place it on the plan, using earlier commitment details. Do not add tentative possibilities, preferences, vague availability, or tasks without a chosen time. A request to find, choose, or schedule a time is a request, not a new task; do not turn the requested planning day into the underlying task's deadline. User-described commitments or free time are usable availability even without calendar access. For a scheduling request with enough user-supplied availability and a known task duration, choose one specific uninterrupted block, set proposedTime, and explain the key tradeoff naturally in recommendationReason. Use only the schedule the user supplied, never claim to have checked a calendar, and never claim anything was changed outside the local preview. If availability is insufficient, leave proposedTime and recommendationReason null. Current local date and time: ${new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: process.env.TIME_ZONE ?? "America/Los_Angeles" }).format(new Date())}. Do not expose hidden chain-of-thought.`,
    messages: [...(options.conversation ?? []), { role: "user", content: message }],
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
    clarificationQuestion: needsClarification ? "how long should i set aside?" : null,
    availabilityProvided: false,
    proposedTime: null,
    recommendationReason: null,
    shouldAddToPlan: false,
    planItemTitle: null,
    planItemDate: null,
    planItemStart: null,
    planItemEnd: null
  };
}
