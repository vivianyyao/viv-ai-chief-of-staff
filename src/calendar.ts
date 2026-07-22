import { google } from "googleapis";
import type { BusyPeriod } from "./types.js";

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
