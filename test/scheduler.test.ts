import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { findTimeBlock } from "../src/scheduler.js";

const base = {
  title: "Write proposal", durationMinutes: 60, earliestStart: null, deadline: null, notes: null
};
const options = {
  timeZone: "America/Los_Angeles", workdayStart: "09:00", workdayEnd: "17:00", searchDays: 14,
  now: DateTime.fromISO("2026-07-22T08:00:00", { zone: "America/Los_Angeles" })
};

describe("findTimeBlock", () => {
  it("returns the first available workday slot", () => {
    expect(findTimeBlock(base, [], options)?.start).toContain("2026-07-22T09:00:00");
  });
  it("moves past a conflicting event", () => {
    const busy = [{ start: "2026-07-22T09:00:00-07:00", end: "2026-07-22T10:30:00-07:00" }];
    expect(findTimeBlock(base, busy, options)?.start).toContain("2026-07-22T10:30:00");
  });
  it("honors an explicit earliest time", () => {
    const task = { ...base, earliestStart: "2026-07-23T13:00:00-07:00" };
    expect(findTimeBlock(task, [], options)?.start).toContain("2026-07-23T13:00:00");
  });
  it("does not search beyond the configured horizon", () => {
    const task = { ...base, earliestStart: "2026-08-20T09:00:00-07:00", deadline: "2026-09-01T17:00:00-07:00" };
    expect(findTimeBlock(task, [], options)).toBeNull();
  });
});
