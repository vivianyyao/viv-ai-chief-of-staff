import type { SmsInterpretation } from "./sms-interpreter.js";

export type SmsInterpreter = (message: string) => Promise<SmsInterpretation>;

export function isAllowedPhone(incoming: string | undefined, allowed: string): boolean {
  return Boolean(incoming && incoming.trim() === allowed.trim() && /^\+[1-9]\d{7,14}$/.test(allowed.trim()));
}

export function writeVivReply(value: SmsInterpretation): string {
  if (value.shouldAddToPlan && value.planItemTitle && value.planItemStart && value.planItemEnd) {
    const date = value.planItemDate ? `${value.planItemDate}, ` : "";
    return `added to your local plan.\n\n${value.planItemTitle}\n${date}${value.planItemStart}–${value.planItemEnd}\n\nnothing changed outside this preview.`;
  }
  if (value.kind === "context") {
    if (value.availabilityProvided) {
      return "got it.\n\ni’ll keep that in mind while we find the best time.\n\nnothing has been changed.";
    }
    return "understood.\n\ni’m treating that as context, not a task.\n\nonce calendar access is connected, i’ll use that to make a lighter recommendation.";
  }
  if (value.needsClarification) {
    return `got it.\n\n${value.clarificationQuestion ?? "what detail should i keep in mind?"}`;
  }
  if (value.kind === "request" && /\b(find|choose|pick|schedule|time slot|when)\b/i.test(value.taskOrRequest ?? "")) {
    if (value.availabilityProvided && value.proposedTime) {
      const reason = value.recommendationReason ? `\n\n${value.recommendationReason}` : "";
      return `i’d do ${value.proposedTime}.${reason}\n\nthat’s a proposal based on what you told me. nothing has been changed.`;
    }
    return "i can help with that once calendar access is connected.\n\nright now, i’d be guessing at your availability.\n\ni’m not changing anything yet.";
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
