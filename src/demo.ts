import { DateTime } from "luxon";
import { findTimeBlock } from "./scheduler.js";
import type { BusyPeriod, StructuredTask } from "./types.js";

export type DemoResult = {
  task: StructuredTask;
  busy: Array<BusyPeriod & { title: string }>;
  proposed: { start: string; end: string } | null;
  reasoning: string;
  recommendation: {
    title: string;
    dateLabel: string;
    startLabel: string;
    endLabel: string;
    confidence: "High" | "Medium";
    reasons: string[];
  } | null;
  timeZone: string;
};

function explainPlan(
  task: StructuredTask,
  busy: Array<BusyPeriod & { title: string }>,
  proposed: { start: string; end: string } | null,
  timeZone: string
): string {
  if (!proposed) {
    return `I noticed this task needs ${task.durationMinutes} uninterrupted minutes, but the open time around your existing commitments was too fragmented. I held off on forcing it into a rushed window so we can find a block where you can give it proper attention.`;
  }

  const format = (iso: string) => DateTime.fromISO(iso).setZone(timeZone).toFormat("h:mm a");
  const first = busy[0];
  const after = busy.filter((event) => DateTime.fromISO(event.start) >= DateTime.fromISO(proposed.end));
  const noticed = first
    ? `I noticed your day already has ${busy.map((event) => `${event.title.toLowerCase()} from ${format(event.start)} to ${format(event.end)}`).join(", ")}.`
    : "I noticed you have a clear day with plenty of room to focus.";
  const constraint = `“${task.title}” needs about ${task.durationMinutes} uninterrupted minutes, so I looked for a window where you can finish it without context switching.`;
  const choice = `The first strong focus block is ${format(proposed.start)}–${format(proposed.end)}.`;
  const rejected = "The earlier openings are either already spoken for or too fragmented to be useful, and pushing it later would make the afternoon feel unnecessarily compressed.";
  const flexibility = after.length
    ? "Putting it here protects those commitments and still gives you breathing room before what comes next."
    : "Putting it here protects the rest of your afternoon and leaves some flexibility afterward.";
  return `${noticed}\n\n${constraint} ${choice}\n\n${rejected} ${flexibility}`;
}

function demoTask(message: string, now: DateTime): StructuredTask {
  const durationMatch = message.match(/(\d+)\s*(?:minutes?|mins?)/i);
  const hourMatch = message.match(/(\d+(?:\.\d+)?)\s*hours?/i);
  const durationMinutes = durationMatch
    ? Math.min(480, Math.max(15, Number(durationMatch[1])))
    : hourMatch ? Math.min(480, Math.max(15, Number(hourMatch[1]) * 60)) : 30;
  const cleaned = message
    .replace(/\b(?:for|about|around)?\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?)\b/gi, "")
    .replace(/\s+/g, " ").replace(/[,. ]+$/, "").trim();
  const title = cleaned || "Untitled task";
  const friday = now.plus({ days: ((5 - now.weekday + 7) % 7) || 7 }).set({ hour: 17, minute: 0 });
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    durationMinutes,
    earliestStart: null,
    deadline: /friday/i.test(message) ? friday.toISO() : null,
    notes: null
  };
}

export function createDemoPlan(message: string, suppliedNow?: DateTime): DemoResult {
  const timeZone = "America/Los_Angeles";
  const now = (suppliedNow ?? DateTime.now()).setZone(timeZone);
  const firstWorkday = now.weekday > 5 ? now.plus({ days: 8 - now.weekday }) : now;
  const day = firstWorkday.startOf("day");
  const busy = [
    { title: "Team check-in", start: day.set({ hour: 9 }).toISO()!, end: day.set({ hour: 9, minute: 30 }).toISO()! },
    { title: "Project meeting", start: day.set({ hour: 11 }).toISO()!, end: day.set({ hour: 12 }).toISO()! },
    { title: "Lunch", start: day.set({ hour: 12, minute: 30 }).toISO()!, end: day.set({ hour: 13, minute: 30 }).toISO()! }
  ];
  const task = demoTask(message, now);
  const proposed = findTimeBlock(task, busy, {
    timeZone, workdayStart: "09:00", workdayEnd: "17:00", searchDays: 14, now
  });
  const reasoning = explainPlan(task, busy, proposed, timeZone);
  const recommendation = proposed ? (() => {
    const start = DateTime.fromISO(proposed.start).setZone(timeZone);
    const end = DateTime.fromISO(proposed.end).setZone(timeZone);
    const dateLabel = start.hasSame(now, "day") ? "Today" : start.hasSame(now.plus({ days: 1 }), "day") ? "Tomorrow" : start.toFormat("cccc, LLL d");
    return {
      title: task.title,
      dateLabel,
      startLabel: start.toFormat("h:mm a"),
      endLabel: end.toFormat("h:mm a"),
      confidence: "High" as const,
      reasons: ["uninterrupted focus time", "no conflicts", "still leaves time afterward"]
    };
  })() : null;
  return { task, busy, proposed, reasoning, recommendation, timeZone };
}
