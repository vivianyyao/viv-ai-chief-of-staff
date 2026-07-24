import { describe, expect, it } from "vitest";
import { applyRadarMemory, deriveEventContextFromMessage, guardPlanConflicts, interpretSmsLocally, mergePendingEvent, prepareEventContext, resolveFatigueSchedulingFollowUp, selectPendingEvent, validateSmsInterpretation } from "../src/sms-interpreter.js";
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

  it("keeps generated calendar titles to five words", () => {
    expect(validateSmsInterpretation({
      kind: "context", taskOrRequest: null, durationMinutes: null,
      deadline: null, needsClarification: false, clarificationQuestion: null,
      shouldAddToPlan: true,
      planItemTitle: "dinner in sf with grace and ivanna",
      planItemDate: "today", planItemStart: "19:00", planItemEnd: "21:00",
      planItemDetails: "who: grace and ivanna\nwhere: marufuku japantown\nwhat: dinner"
    }).planItemTitle).toBe("dinner in sf with grace");
  });

  it("asks before adding an event over an occupied block", () => {
    const result = guardPlanConflicts({
      kind: "context", taskOrRequest: null, durationMinutes: null,
      deadline: null, needsClarification: false, clarificationQuestion: null,
      shouldAddToPlan: true, planItemTitle: "craft night",
      planItemDate: "today", planItemStart: "20:30", planItemEnd: "23:00",
      planItemDetails: "who: grace and ivanna\nwhere: sf\nwhat: craft night\nwhy: spend time together"
    }, [{ title: "dinner", date: "today", start: "19:00", end: "21:00", details: null }], new Date(2026, 6, 24, 16));
    expect(result).toMatchObject({
      shouldAddToPlan: false,
      needsClarification: true,
      clarificationQuestion: "craft night overlaps dinner at 20:30–21:00. what should move?"
    });
    expect(writeVivReply(result)).toContain("what should move?");
  });

  it("builds literal event fields and asks for any missing context", () => {
    const result = prepareEventContext({
      kind: "context", taskOrRequest: null, durationMinutes: null,
      deadline: null, needsClarification: false, clarificationQuestion: null,
      shouldAddToPlan: true, planItemTitle: "dinner with friends",
      planItemDate: "today", planItemStart: "19:00", planItemEnd: "21:00",
      planItemWho: "ivanna and grace", planItemWhere: "marufuku, japantown",
      planItemWhat: "dinner", planItemWhy: null, planItemDetails: null
    });
    expect(result).toMatchObject({
      shouldAddToPlan: false,
      needsClarification: true,
      clarificationQuestion: "why?",
      planItemDetails: "who: ivanna and grace\nwhere: marufuku, japantown\nwhat: dinner"
    });
  });

  it("fills a pending event from the next conversational answer", () => {
    const result = prepareEventContext(mergePendingEvent({
      kind: "context", taskOrRequest: null, durationMinutes: null,
      deadline: null, needsClarification: false, clarificationQuestion: null,
      shouldAddToPlan: false, planItemTitle: null, planItemDate: null,
      planItemStart: null, planItemEnd: null,
      planItemWho: "grace and ivanna", planItemWhere: null,
      planItemWhat: null, planItemWhy: "fun gno", planItemDetails: null
    }, {
      title: "craft night", date: "today", start: "20:30", end: "23:00",
      who: null, where: null, what: "craft night", why: null, details: null
    }, "grace and ivanna. location unknown yet. for a fun gno"));
    expect(result).toMatchObject({
      shouldAddToPlan: true,
      needsClarification: false,
      planItemWho: "grace and ivanna",
      planItemWhere: "tbd",
      planItemWhat: "craft night",
      planItemWhy: "fun gno",
      planItemDetails: "who: grace and ivanna\nwhere: tbd\nwhat: craft night\nwhy: fun gno"
    });
  });

  it("extracts who, where, and what directly from a natural event sentence", () => {
    const result = prepareEventContext(deriveEventContextFromMessage({
      kind: "context", taskOrRequest: null, durationMinutes: null,
      deadline: null, needsClarification: false, clarificationQuestion: null,
      shouldAddToPlan: true, planItemTitle: "dinner with friends",
      planItemDate: "today", planItemStart: "19:00", planItemEnd: "21:00",
      planItemWho: null, planItemWhere: null, planItemWhat: null,
      planItemWhy: null, planItemDetails: null
    }, "dinner with ivanna and grace at marufuku in japantown at 7pm tonight"));
    expect(result).toMatchObject({
      planItemWho: "ivanna and grace",
      planItemWhere: "marufuku in japantown",
      planItemWhat: "dinner",
      clarificationQuestion: "why?"
    });
  });

  it("drops stale pending context when the user states a different timed event", () => {
    const pending = {
      title: "craft night", date: "today", start: "20:30", end: "23:00",
      who: null, where: null, what: "craft night", why: null, details: null
    };
    expect(selectPendingEvent("dinner with ivanna at marufuku at 7pm", pending)).toBeNull();
    expect(selectPendingEvent("grace and ivanna. location unknown yet", pending)).toEqual(pending);
  });

  it("recognizes a natural answer to why", () => {
    const result = prepareEventContext(deriveEventContextFromMessage({
      kind: "context", taskOrRequest: null, durationMinutes: null,
      deadline: null, needsClarification: true, clarificationQuestion: "why?",
      shouldAddToPlan: true, planItemTitle: "dinner with friends",
      planItemDate: "today", planItemStart: "19:00", planItemEnd: "21:00",
      planItemWho: "ivanna and grace", planItemWhere: "marufuku in japantown",
      planItemWhat: "dinner", planItemWhy: null, planItemDetails: null
    }, "for a fun gno!"));
    expect(result).toMatchObject({
      shouldAddToPlan: true,
      planItemWhy: "a fun gno",
      planItemDetails: "who: ivanna and grace\nwhere: marufuku in japantown\nwhat: dinner\nwhy: a fun gno"
    });
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

  it("resolves an exhausted scheduling follow-up back to the remembered task", () => {
    const result = resolveFatigueSchedulingFollowUp("i’m exhausted tonight. when should i do it?", [{
      taskOrRequest: "finish my application", durationMinutes: 120,
      deadline: "friday", needsClarification: false
    }], [], new Date(2026, 6, 22, 16));
    expect(result).toMatchObject({
      kind: "request", intent: "scheduling_request",
      taskOrRequest: "finish my application", durationMinutes: 120,
      deadline: "friday", proposedDate: "tomorrow",
      proposedStart: "09:00", proposedEnd: "11:00"
    });
    expect(writeVivReply(result!)).toContain("you sound done for tonight");
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

  it("captures a hedged personal action on the active radar", () => {
    expect(interpretSmsLocally("i should probably call grandma sometime")).toMatchObject({
      kind: "task",
      taskOrRequest: "call grandma",
      radarCategory: "radar",
      needsClarification: true
    });
  });

  it("sorts loose thoughts into quiet radar categories", () => {
    expect(interpretSmsLocally("waiting on reply from danielle").radarCategory).toBe("waiting");
    expect(interpretSmsLocally("buy passport photos").radarCategory).toBe("thinking");
    expect(interpretSmsLocally("japan trip someday").radarCategory).toBe("someday");
  });

  it("treats feelings as context", () => {
    const interpretation = interpretSmsLocally("i’m exhausted");
    expect(interpretation.intent).toBe("personal_context");
    expect(writeVivReply(interpretation)).toContain("i’ll treat that as context");
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

  it("asks for a missing commitment end time before treating it as context", () => {
    expect(writeVivReply({
      kind: "context",
      taskOrRequest: null,
      durationMinutes: null,
      deadline: null,
      needsClarification: true,
      clarificationQuestion: "what time does dinner end?",
      availabilityProvided: true,
      shouldAddToPlan: false,
      planItemTitle: "dinner with grace and ivanna",
      planItemDate: "today",
      planItemStart: "19:00",
      planItemEnd: null,
      planItemDetails: "marufuku japantown"
    })).toBe("got it.\n\nwhat time does dinner end?");
  });

  it("asks for the missing schedule context instead of inventing a slot", () => {
    expect(writeVivReply({
      kind: "request",
      taskOrRequest: "find the best time slot today for interview prep",
      durationMinutes: 120,
      deadline: "before tomorrow at 10:30 am",
      needsClarification: false,
      clarificationQuestion: null
    })).toContain("what time on your day is already fixed?");
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
    })).toBe("i’d do 14:20–16:20 today.\n\nit gives you two uninterrupted hours before the dog walk and keeps dinner clear\n\nthat’s a proposal based on what you told me. nothing has been changed.");
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
    })).toContain("i’d do 15:30–16:30 today");
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
    })).toBe("got it.\n\ncall with danielle jing\ntoday\n17:00–17:20\n\nadded.\n\ni’ll plan around that.");
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
