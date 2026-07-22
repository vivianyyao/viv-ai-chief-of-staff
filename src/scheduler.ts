import { DateTime, Interval } from "luxon";
import type { BusyPeriod, StructuredTask, TimeBlock } from "./types.js";

type ScheduleOptions = {
  timeZone: string;
  workdayStart: string;
  workdayEnd: string;
  searchDays: number;
  now?: DateTime;
};

function parseHint(value: string | null, zone: string): DateTime | null {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { zone });
  return dt.isValid ? dt : null;
}

export function findTimeBlock(task: StructuredTask, busy: BusyPeriod[], options: ScheduleOptions): TimeBlock | null {
  const now = (options.now ?? DateTime.now().setZone(options.timeZone)).setZone(options.timeZone);
  const earliestHint = parseHint(task.earliestStart, options.timeZone);
  const deadline = parseHint(task.deadline, options.timeZone);
  const nextAvailableMinute = now.plus({ minutes: 5 }).startOf("minute");
  const startBoundary = earliestHint && earliestHint > nextAvailableMinute ? earliestHint : nextAvailableMinute;
  const horizon = now.plus({ days: options.searchDays }).endOf("day");
  const searchEnd = deadline && deadline < horizon ? deadline : horizon;
  const busyIntervals = busy
    .map((b) => Interval.fromDateTimes(DateTime.fromISO(b.start), DateTime.fromISO(b.end)))
    .filter((i) => i.isValid);

  for (let day = startBoundary.startOf("day"); day <= searchEnd; day = day.plus({ days: 1 })) {
    if (day.weekday > 5) continue;
    const [startHour = 9, startMinute = 0] = options.workdayStart.split(":").map(Number);
    const [endHour = 17, endMinute = 0] = options.workdayEnd.split(":").map(Number);
    let cursor = day.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
    const workEnd = day.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });
    if (cursor < startBoundary) cursor = startBoundary;
    const remainder = cursor.minute % 15;
    if (remainder) cursor = cursor.plus({ minutes: 15 - remainder });

    while (cursor.plus({ minutes: task.durationMinutes }) <= workEnd && cursor.plus({ minutes: task.durationMinutes }) <= searchEnd) {
      const candidate = Interval.fromDateTimes(cursor, cursor.plus({ minutes: task.durationMinutes }));
      const collision = busyIntervals.find((period) => period.overlaps(candidate));
      if (!collision) return { start: candidate.start!.toISO()!, end: candidate.end!.toISO()! };
      cursor = collision.end!.setZone(options.timeZone);
      const nextRemainder = cursor.minute % 15;
      if (nextRemainder) cursor = cursor.plus({ minutes: 15 - nextRemainder });
    }
  }
  return null;
}
