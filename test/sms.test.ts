import { describe, expect, it } from "vitest";
import { interpretSmsLocally, validateSmsInterpretation } from "../src/sms-interpreter.js";
import { isAllowedPhone, processSmsMessage, writeVivReply } from "../src/sms-service.js";

describe("Viv SMS interpretation", () => {
  it("validates the structured Claude result", () => {
    expect(validateSmsInterpretation({
      kind: "task", taskOrRequest: "finish afterquery application", durationMinutes: 90,
      deadline: "tomorrow", needsClarification: false, clarificationQuestion: null
    }).durationMinutes).toBe(90);
  });

  it("rejects clarification without a question", () => {
    expect(() => validateSmsInterpretation({
      kind: "task", taskOrRequest: "call mom", durationMinutes: null,
      deadline: "this week", needsClarification: true, clarificationQuestion: null
    })).toThrow();
  });

  it("writes a concise task reply without changing anything", () => {
    expect(writeVivReply({
      kind: "task", taskOrRequest: "finish afterquery application", durationMinutes: 90,
      deadline: "tomorrow", needsClarification: false, clarificationQuestion: null
    })).toBe("got it.\n\ni have:\nfinish afterquery application\n90 minutes\ndue tomorrow\n\ni’m not changing anything yet.");
  });

  it("asks one natural clarification question", () => {
    const result = interpretSmsLocally("call my mom sometime this week");
    expect(writeVivReply(result)).toBe("got it.\n\nhow long should i set aside?");
  });

  it("treats feelings as context", () => {
    expect(writeVivReply(interpretSmsLocally("i’m exhausted"))).toContain("i’m treating that as context, not a task.");
  });

  it("allows only the exact configured E.164 phone number", () => {
    expect(isAllowedPhone("+14155550123", "+14155550123")).toBe(true);
    expect(isAllowedPhone("+14155550999", "+14155550123")).toBe(false);
    expect(isAllowedPhone("4155550123", "4155550123")).toBe(false);
  });

  it("supports a local test without Claude or Twilio", async () => {
    const result = await processSmsMessage("finish the deck tomorrow, about 90 minutes", async (message) => interpretSmsLocally(message));
    expect(result.interpretation.durationMinutes).toBe(90);
    expect(result.interpretation.taskOrRequest).toBe("finish the deck");
    expect(result.reply).toContain("due tomorrow");
  });
});
