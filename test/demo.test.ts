import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { createDemoPlan } from "../src/demo.js";
import { normalizeLocalPlan } from "../src/demo-server.js";

describe("Viv local experience", () => {
  it("safely carries visible plan items into Viv's reasoning", () => {
    expect(normalizeLocalPlan([
      { title: "call with danielle", date: "today", start: "17:00", end: "17:20", details: "recruiter" },
      { title: "bad entry", start: "later", end: "soon" }
    ])).toEqual([
      { title: "call with danielle", date: "today", start: "17:00", end: "17:20", details: "recruiter" }
    ]);
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
