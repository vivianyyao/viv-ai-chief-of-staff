import { google, type calendar_v3 } from "googleapis";
import { DateTime } from "luxon";
import type { BusyPeriod } from "./types.js";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  details: string | null;
  source: "google";
};

export function normalizeCalendarEvent(event: calendar_v3.Schema$Event, timeZone: string): CalendarEvent | null {
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  const start = DateTime.fromISO(event.start.dateTime, { setZone: true }).setZone(timeZone);
  const end = DateTime.fromISO(event.end.dateTime, { setZone: true }).setZone(timeZone);
  if (!start.isValid || !end.isValid) return null;
  const details = [event.location, event.description, event.hangoutLink]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("\n\n")
    .slice(0, 2000);
  return {
    id: event.id ?? `${start.toISO()}-${event.summary ?? "busy"}`,
    title: event.summary?.trim() || "busy",
    date: start.toISODate()!,
    start: start.toFormat("HH:mm"),
    end: end.toFormat("HH:mm"),
    details: details || null,
    source: "google"
  };
}

export async function getCalendarEvents(options: {
  clientId: string; clientSecret: string; refreshToken: string; calendarId: string;
  timeZone: string; timeMin: string; timeMax: string;
}): Promise<CalendarEvent[]> {
  const auth = new google.auth.OAuth2(options.clientId, options.clientSecret);
  auth.setCredentials({ refresh_token: options.refreshToken });
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.events.list({
    calendarId: options.calendarId,
    timeMin: options.timeMin,
    timeMax: options.timeMax,
    timeZone: options.timeZone,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100
  });
  return (response.data.items ?? []).flatMap((event) => {
    const normalized = normalizeCalendarEvent(event, options.timeZone);
    return normalized ? [normalized] : [];
  });
}

export async function getBusyPeriods(options: {
  clientId: string; clientSecret: string; refreshToken: string; calendarId: string;
  timeZone: string; timeMin: string; timeMax: string;
}): Promise<BusyPeriod[]> {
  const auth = new google.auth.OAuth2(options.clientId, options.clientSecret);
  auth.setCredentials({ refresh_token: options.refreshToken });
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: options.timeMin,
      timeMax: options.timeMax,
      timeZone: options.timeZone,
      items: [{ id: options.calendarId }]
    }
  });
  return (response.data.calendars?.[options.calendarId]?.busy ?? [])
    .filter((p): p is { start: string; end: string } => Boolean(p.start && p.end));
}
