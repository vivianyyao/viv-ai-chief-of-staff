import type { SmsInterpretation } from "./sms-interpreter.js";

export type SmsInterpreter = (message: string) => Promise<SmsInterpretation>;

export function isAllowedPhone(incoming: string | undefined, allowed: string): boolean {
  return Boolean(incoming && incoming.trim() === allowed.trim() && /^\+[1-9]\d{7,14}$/.test(allowed.trim()));
}

export function writeVivReply(value: SmsInterpretation): string {
  if (value.shouldAddToPlan && value.planItemTitle && value.planItemStart && value.planItemEnd) {
    const date = value.planItemDate ? `${value.planItemDate}, ` : "";
    return `i’ll keep this in mind here.\n\n${value.planItemTitle}\n${date}${value.planItemStart}–${value.planItemEnd}\n\nnothing was changed outside this conversation.`;
  }
  if (value.kind === "context") {
    if (value.availabilityProvided) {
      return "got it.\n\ni’ll keep that in mind while we find the best time.\n\nnothing has been changed.";
    }
    return "understood.\n\ni’ll treat that as context for what i recommend next.";
  }
  if (value.needsClarification) {
    return `got it.\n\n${value.clarificationQuestion ?? "what detail should i keep in mind?"}`;
  }
  if (value.kind === "request" && /\b(find|choose|pick|schedule|time slot|when)\b/i.test(value.taskOrRequest ?? "")) {
    if (value.proposedTime) {
      const reason = value.recommendationReason ? `\n\n${value.recommendationReason}` : "";
      return `i’d do ${value.proposedTime}.${reason}\n\nthat’s a proposal based on what you told me. nothing has been changed.`;
    }
    return "i can help with that.\n\nwhat time on your day is already fixed?";
  }
  const details = [value.taskOrRequest];
  if (value.durationMinutes !== null) details.push(`${value.durationMinutes} minutes`);
  if (value.deadline) details.push(`due ${value.deadline}`);
  return `got it.\n\ni have:\n${details.filter(Boolean).join("\n")}\n\ni’m not changing anything yet.`;
}

export async function processSmsMessage(message: string, interpret: SmsInterpreter) {
  const interpretation = await interpret(message);
  return { interpretation, reply: writeVivReply(interpretation) };
}
