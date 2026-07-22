import { describe, expect, it } from "vitest";
import { applyRadarMemory, interpretSmsLocally, validateSmsInterpretation } from "../src/sms-interpreter.js";
import { isAllowedPhone, processSmsMessage, writeVivReply } from "../src/sms-service.js";

describe("Viv SMS interpretation", () => {
  it("validates the structured Claude result", () => {
    expect(validateSmsInterpretation({
      kind: "task", taskOrRequest: "finish afterquery application", durationMinutes: 90,
      deadline: "tomorrow", needsClarification: false, clarificationQuestion: null
    }).durationMinutes).toBe(90);
  });

  it("validates structured proposal times", () => {
    expect(validateSmsInterpretation({
      kind: "request", taskOrRequest: "prep for brex interview", durationMinutes: 60,
      deadline: "tomorrow at 10:30am", needsClarification: false, clarificationQuestion: null,
      proposedTime: "today 3:15pm–4:15pm", proposedDate: "today", proposedStart: "15:15", proposedEnd: "16:15"
    }).proposedStart).toBe("15:15");
  });

  it("attaches a duration-only reply to the one radar task waiting for it", () => {
    expect(applyRadarMemory({
      kind: "context", taskOrRequest: null, durationMinutes: 60, deadline: null,
      needsClarification: false, clarificationQuestion: null
    }, [{
      taskOrRequest: "prep for brex interview", durationMinutes: null,
      deadline: "today", needsClarification: true
    }])).toMatchObject({
      kind: "task", taskOrRequest: "prep for brex interview", durationMinutes: 60,
      deadline: "today", needsClarification: false
    });
  });

  it("restores a known duration when a radar task is mentioned again", () => {
    expect(applyRadarMemory({
      kind: "request", taskOrRequest: "prep for brex interview", durationMinutes: null,
      deadline: "today", needsClarification: true, clarificationQuestion: "how long should i set aside?"
    }, [{
      taskOrRequest: "prep for brex interview", durationMinutes: 60,
      deadline: "tomorrow at 10:30am", needsClarification: false
    }])).toMatchObject({ durationMinutes: 60, needsClarification: false, clarificationQuestion: null });
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

  it("acknowledges schedule context without repeating the task", () => {
    expect(writeVivReply({
      kind: "context",
      taskOrRequest: null,
      durationMinutes: null,
      deadline: null,
      needsClarification: false,
      clarificationQuestion: null,
      availabilityProvided: true,
      proposedTime: null,
      recommendationReason: null
    })).toBe("got it.\n\ni’ll keep that in mind while we find the best time.\n\nnothing has been changed.");
  });

  it("does not pretend to find a calendar slot before calendar access exists", () => {
    expect(writeVivReply({
      kind: "request",
      taskOrRequest: "find the best time slot today for interview prep",
      durationMinutes: 120,
      deadline: "before tomorrow at 10:30 am",
      needsClarification: false,
      clarificationQuestion: null
    })).toContain("i’d be guessing at your availability");
  });

  it("can recommend a block from availability the user supplied", () => {
    expect(writeVivReply({
      kind: "request",
      taskOrRequest: "find a time for interview prep",
      durationMinutes: 120,
      deadline: "before tomorrow at 10:30 am",
      needsClarification: false,
      clarificationQuestion: null,
      availabilityProvided: true,
      proposedTime: "2:20–4:20 pm today",
      recommendationReason: "it gives you two uninterrupted hours before the dog walk and keeps dinner clear"
    })).toBe("i’d do 2:20–4:20 pm today.\n\nit gives you two uninterrupted hours before the dog walk and keeps dinner clear\n\nthat’s a proposal based on what you told me. nothing has been changed.");
  });

  it("uses a recommendation produced from the local plan", () => {
    expect(writeVivReply({
      kind: "request",
      taskOrRequest: "when should i do interview prep",
      durationMinutes: 60,
      deadline: "later today",
      needsClarification: false,
      clarificationQuestion: null,
      availabilityProvided: false,
      proposedTime: "3:30–4:30 pm today",
      recommendationReason: "it gives you an uninterrupted hour before your 5:00 pm call"
    })).toContain("i’d do 3:30–4:30 pm today");
  });

  it("confirms a commitment added only to the local plan", () => {
    expect(writeVivReply({
      kind: "context",
      taskOrRequest: null,
      durationMinutes: 20,
      deadline: null,
      needsClarification: false,
      clarificationQuestion: null,
      availabilityProvided: true,
      proposedTime: null,
      recommendationReason: null,
      shouldAddToPlan: true,
      planItemTitle: "call with danielle jing",
      planItemDate: "today",
      planItemStart: "17:00",
      planItemEnd: "17:20",
      planItemDetails: "danielle is a recruiter. scheduled on linkedin. https://meet.example.com/viv"
    })).toBe("added to your local plan.\n\ncall with danielle jing\ntoday, 17:00–17:20\n\nnothing changed outside this preview.");
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
