import { DateTime } from "luxon";
import { findTimeBlock } from "./scheduler.js";
import type { BusyPeriod, InterpretedTask, StructuredTask } from "./types.js";

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
    return `i noticed this needs ${task.durationMinutes} uninterrupted minutes, but the open time around your commitments is too fragmented. i’d hold off rather than force it into a rushed window.`;
  }

  const format = (iso: string) => DateTime.fromISO(iso).setZone(timeZone).toFormat("h:mm a");
  const noticed = busy.length
    ? `i noticed your day is broken up by ${busy.map((event) => event.title.toLowerCase()).join(", ")}.`
    : "i noticed you have a clear day with room to focus.";
  const focus = `this needs about ${task.durationMinutes} uninterrupted minutes, and ${format(proposed.start)} is the first clean focus block.`;
  const tradeoff = "the earlier openings are occupied or too fragmented to be useful.";
  const outcome = "placing it here avoids context switching and still leaves flexibility afterward.";
  return `${noticed} ${focus} ${tradeoff} ${outcome}`;
}

export function interpretLocally(message: string, now: DateTime): InterpretedTask {
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
    deadline: /friday/i.test(message) ? friday.toISO() : null,
    priority: /urgent|important|tomorrow|today/i.test(message) ? "high" : "medium",
    intent: "schedule_task"
  };
}

export function createPlanFromTask(interpreted: InterpretedTask, suppliedNow?: DateTime): DemoResult {
  const timeZone = "America/Los_Angeles";
  const now = (suppliedNow ?? DateTime.now()).setZone(timeZone);
  const firstWorkday = now.weekday > 5 ? now.plus({ days: 8 - now.weekday }) : now;
  const day = firstWorkday.startOf("day");
  const busy = [
    { title: "Team check-in", start: day.set({ hour: 9 }).toISO()!, end: day.set({ hour: 9, minute: 30 }).toISO()! },
    { title: "Project meeting", start: day.set({ hour: 11 }).toISO()!, end: day.set({ hour: 12 }).toISO()! },
    { title: "Lunch", start: day.set({ hour: 12, minute: 30 }).toISO()!, end: day.set({ hour: 13, minute: 30 }).toISO()! }
  ];
  const task: StructuredTask = {
    title: interpreted.title,
    durationMinutes: interpreted.durationMinutes ?? 30,
    earliestStart: null,
    deadline: interpreted.deadline,
    notes: null
  };
  const proposed = findTimeBlock(task, busy, {
    timeZone, workdayStart: "09:00", workdayEnd: "17:00", searchDays: 14, now
  });
  const reasoning = explainPlan(task, busy, proposed, timeZone);
  const recommendation = proposed ? (() => {
    const start = DateTime.fromISO(proposed.start).setZone(timeZone);
    const end = DateTime.fromISO(proposed.end).setZone(timeZone);
    const dateLabel = start.hasSame(now, "day")
      ? `today, ${start.toFormat("LLLL d").toLowerCase()}`
      : start.hasSame(now.plus({ days: 1 }), "day")
        ? `tomorrow, ${start.toFormat("LLLL d").toLowerCase()}`
        : start.toFormat("cccc, LLLL d").toLowerCase();
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

export function createDemoPlan(message: string, suppliedNow?: DateTime): DemoResult {
  const now = (suppliedNow ?? DateTime.now()).setZone("America/Los_Angeles");
  return createPlanFromTask(interpretLocally(message, now), now);
}
