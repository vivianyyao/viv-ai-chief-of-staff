import type { SmsInterpretation } from "./sms-interpreter.js";

export type SmsInterpreter = (message: string) => Promise<SmsInterpretation>;

export function isAllowedPhone(incoming: string | undefined, allowed: string): boolean {
  return Boolean(incoming && incoming.trim() === allowed.trim() && /^\+[1-9]\d{7,14}$/.test(allowed.trim()));
}

export function writeVivReply(value: SmsInterpretation): string {
  if (value.kind === "context") {
    return "understood.\n\ni’m treating that as context, not a task.\n\nonce calendar access is connected, i’ll use that to make a lighter recommendation.";
  }
  if (value.needsClarification) {
    return `got it.\n\n${value.clarificationQuestion ?? "what detail should i keep in mind?"}`;
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
