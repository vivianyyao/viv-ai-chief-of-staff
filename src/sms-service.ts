import type { SmsInterpretation } from "./sms-interpreter.js";

export type SmsInterpreter = (message: string) => Promise<SmsInterpretation>;

export function isAllowedPhone(incoming: string | undefined, allowed: string): boolean {
  return Boolean(incoming && incoming.trim() === allowed.trim() && /^\+[1-9]\d{7,14}$/.test(allowed.trim()));
}

function to24HourText(value: string): string {
  const convert = (rawHour: string, rawMinute: string | undefined, meridiem: string) => {
    let hour = Number(rawHour) % 12;
    if (String(meridiem).toLowerCase().startsWith("p")) hour += 12;
    return `${String(hour).padStart(2, "0")}:${rawMinute ?? "00"}`;
  };
  return value
    .replace(/\b(1[0-2]|0?\d)(?::([0-5]\d))?\s*[–-]\s*(1[0-2]|0?\d)(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
      (_match, startHour, startMinute, endHour, endMinute, meridiem) => `${convert(startHour, startMinute, meridiem)}–${convert(endHour, endMinute, meridiem)}`)
    .replace(/\b(1[0-2]|0?\d)(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
      (_match, rawHour, rawMinute, meridiem) => convert(rawHour, rawMinute, meridiem));
}

function proposedTimeLabel(value: SmsInterpretation): string {
  if (value.proposedStart && value.proposedEnd) {
    const date = value.proposedDate ? `${value.proposedDate}, ` : "";
    return `${date}${value.proposedStart}–${value.proposedEnd}`;
  }
  return to24HourText(value.proposedTime ?? "");
}

export function writeVivReply(value: SmsInterpretation): string {
  if (value.shouldAddToPlan && value.planItemTitle && value.planItemStart && value.planItemEnd) {
    const date = value.planItemDate ? `${value.planItemDate}\n` : "";
    return `got it.\n\n${value.planItemTitle}\n${date}${value.planItemStart}–${value.planItemEnd}\n\nadded.\n\ni’ll plan around that.`;
  }
  if (value.kind === "context") {
    if (value.availabilityProvided) {
      return "got it.\n\ni’ll keep that in mind while we find the best time.\n\nnothing has been changed.";
    }
    return "understood.\n\ni’ll treat that as context for what i recommend next.";
  }
  if (value.taskOrRequest && value.radarCategory === "waiting") {
    return `got it.\n\nwaiting on:\n${value.taskOrRequest}`;
  }
  if (value.taskOrRequest && value.radarCategory === "thinking") {
    return `noted.\n\n${value.taskOrRequest}\n\ni’ll keep that under thinking about.`;
  }
  if (value.taskOrRequest && value.radarCategory === "someday") {
    return `noted.\n\n${value.taskOrRequest}\n\ni’ll keep that under someday.`;
  }
  if (value.needsClarification) {
    return `got it.\n\n${value.clarificationQuestion ?? "what detail should i keep in mind?"}`;
  }
  if (value.kind === "request" && (value.intent === "scheduling_request" || value.proposedTime || /\b(find|choose|pick|schedule|time slot|when)\b/i.test(value.taskOrRequest ?? ""))) {
    if (value.proposedTime) {
      const reason = value.recommendationReason ? `\n\n${to24HourText(value.recommendationReason)}` : "";
      return `i’d do ${proposedTimeLabel(value)}.${reason}\n\nthat’s a proposal based on what you told me. nothing has been changed.`;
    }
    return "i can help with that.\n\nwhat time on your day is already fixed?";
  }
  const details = [value.taskOrRequest];
  if (value.durationMinutes !== null) details.push(`${value.durationMinutes} minutes`);
  if (value.deadline) details.push(`due ${to24HourText(value.deadline)}`);
  return `got it.\n\ni have:\n${details.filter(Boolean).join("\n")}\n\ni’m not changing anything yet.`;
}

export async function processSmsMessage(message: string, interpret: SmsInterpreter) {
  const interpretation = await interpret(message);
  return { interpretation, reply: writeVivReply(interpretation) };
}
