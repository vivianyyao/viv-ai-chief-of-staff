import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { createDemoPlan } from "../src/demo.js";
import {
  buildScheduleReply,
  calendarDayRange,
  createSessionToken,
  getAccessConfig,
  isValidSessionToken,
  normalizeLocalPlan,
  normalizeRadar,
  safeEqual
} from "../src/demo-server.js";

describe("Viv local experience", () => {
  it("protects hosted Viv with a private password session", () => {
    const now = Date.parse("2026-07-24T12:00:00Z");
    const token = createSessionToken("private-session-secret", now + 60_000);
    expect(safeEqual("correct horse", "correct horse")).toBe(true);
    expect(safeEqual("correct horse", "wrong horse")).toBe(false);
    expect(isValidSessionToken(token, "private-session-secret", now)).toBe(true);
    expect(isValidSessionToken(token, "wrong-secret", now)).toBe(false);
    expect(isValidSessionToken(token, "private-session-secret", now + 60_001)).toBe(false);
    expect(getAccessConfig({ VIV_ACCESS_PASSWORD: "a-long-password", VIV_SESSION_SECRET: "a-long-secret" }).enabled).toBe(true);
    expect(getAccessConfig({ VIV_ACCESS_PASSWORD: "a-long-password" }).misconfigured).toBe(true);
  });

  it("builds the google calendar window for the day being viewed", () => {
    expect(calendarDayRange("2026-07-23", "America/Los_Angeles")?.date).toBe("2026-07-23");
    expect(calendarDayRange("2026-07-23", "America/Los_Angeles")?.timeMin).toContain("2026-07-23T00:00:00.000-07:00");
    expect(calendarDayRange("not-a-date", "America/Los_Angeles")).toBeNull();
  });
  it("safely carries visible plan items into Viv's reasoning", () => {
    expect(normalizeLocalPlan([
      { title: "call with danielle", date: "today", start: "17:00", end: "17:20", details: "recruiter" },
      { title: "bad entry", start: "later", end: "soon" }
    ])).toEqual([
      { title: "call with danielle", date: "today", start: "17:00", end: "17:20", details: "recruiter" }
    ]);
  });

  it("carries active radar tasks into short follow-up reasoning", () => {
    expect(normalizeRadar([
      { taskOrRequest: "apply to one job", durationMinutes: 45, deadline: "today", needsClarification: false }
    ])).toEqual([
      { taskOrRequest: "apply to one job", durationMinutes: 45, deadline: "today", needsClarification: false }
    ]);
  });

  it("answers a schedule question from known commitments", () => {
    expect(buildScheduleReply([
      { title: "badminton", date: "today", start: "19:30", end: "22:00", details: null },
      { title: "call with danielle", date: "today", start: "17:00", end: "17:20", details: "recruiter" }
    ])).toBe("here’s what i have for today:\n\n17:00–17:20\ncall with danielle\n\n19:30–22:00\nbadminton");
  });

  it("interprets a task and proposes a non-conflicting block", () => {
    const now = DateTime.fromISO("2026-07-22T08:00:00", { zone: "America/Los_Angeles" });
    const result = createDemoPlan("Finish the budget deck, about 90 minutes", now);
    expect(result.task.durationMinutes).toBe(90);
    expect(result.task.title).toBe("Finish the budget deck");
    expect(result.proposed?.start).toContain("2026-07-22T09:30:00");
    expect(result.reasoning).toContain("90 uninterrupted minutes");
    expect(result.reasoning).toContain("9:30 AM");
    expect(result.reasoning).toContain("earlier openings");
    expect(result.reasoning).toContain("flexibility afterward");
    expect(result.recommendation?.confidence).toBe("High");
    expect(result.recommendation?.reasons).toContain("no conflicts");
  });
});
