import { describe, expect, it } from "vitest";
import { normalizeCalendarEvent } from "../src/calendar.js";

describe("Google Calendar read-only events", () => {
  it("turns a timed event into a safe local plan item", () => {
    expect(normalizeCalendarEvent({
      id: "event-1",
      summary: "Brex interview",
      location: "Google Meet",
      description: "talk with the hiring manager",
      hangoutLink: "https://meet.google.com/example",
      start: { dateTime: "2026-07-22T10:30:00-07:00" },
      end: { dateTime: "2026-07-22T11:00:00-07:00" }
    }, "America/Los_Angeles")).toEqual({
      id: "event-1",
      title: "Brex interview",
      date: "2026-07-22",
      start: "10:30",
      end: "11:00",
      details: "Google Meet\n\ntalk with the hiring manager\n\nhttps://meet.google.com/example",
      source: "google"
    });
  });

  it("ignores all-day events that cannot fit on the hourly timeline", () => {
    expect(normalizeCalendarEvent({
      summary: "birthday",
      start: { date: "2026-07-22" },
      end: { date: "2026-07-23" }
    }, "America/Los_Angeles")).toBeNull();
  });
});
