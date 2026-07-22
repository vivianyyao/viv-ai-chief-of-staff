import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { createDemoPlan } from "../src/demo.js";

describe("Viv local experience", () => {
  it("interprets a task and proposes a non-conflicting block", () => {
    const now = DateTime.fromISO("2026-07-22T08:00:00", { zone: "America/Los_Angeles" });
    const result = createDemoPlan("Finish the budget deck, about 90 minutes", now);
    expect(result.task.durationMinutes).toBe(90);
    expect(result.task.title).toBe("Finish the budget deck");
    expect(result.proposed?.start).toContain("2026-07-22T09:30:00");
    expect(result.reasoning).toContain("90 uninterrupted minutes");
    expect(result.reasoning).toContain("9:30 AM–11:00 AM");
    expect(result.reasoning).toContain("earlier openings");
    expect(result.reasoning).toContain("breathing room");
    expect(result.recommendation?.confidence).toBe("High");
    expect(result.recommendation?.reasons).toContain("no conflicts");
  });
});
