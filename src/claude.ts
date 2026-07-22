import Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import type { StructuredTask } from "./types.js";

const taskTool: Anthropic.Tool = {
  name: "save_task",
  description: "Convert the SMS into one actionable task to schedule.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short action-oriented task title" },
      durationMinutes: { type: "integer", minimum: 15, maximum: 480, description: "Best estimate; default to 30 when absent" },
      earliestStart: { type: ["string", "null"], description: "ISO 8601 datetime, or null" },
      deadline: { type: ["string", "null"], description: "ISO 8601 datetime, or null" },
      notes: { type: ["string", "null"], description: "Useful context not captured above" }
    },
    required: ["title", "durationMinutes", "earliestStart", "deadline", "notes"],
    additionalProperties: false
  }
};

export async function parseTask(
  message: string,
  options: { apiKey: string; model: string; timeZone: string; now?: DateTime }
): Promise<StructuredTask> {
  const client = new Anthropic({ apiKey: options.apiKey });
  const now = (options.now ?? DateTime.now().setZone(options.timeZone)).toISO();
  const response = await client.messages.create({
    model: options.model,
    max_tokens: 500,
    system: `You parse an SMS into a schedulable task. Current time: ${now}. Time zone: ${options.timeZone}. Resolve relative dates such as tomorrow in that timezone. If duration is absent, use 30 minutes. Call save_task exactly once.`,
    messages: [{ role: "user", content: message }],
    tools: [taskTool],
    tool_choice: { type: "tool", name: "save_task" }
  });
  const call = response.content.find((block) => block.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("Claude did not return a structured task");
  return call.input as StructuredTask;
}
