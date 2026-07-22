import express from "express";
import { DateTime } from "luxon";
import twilio from "twilio";
import { config } from "./config.js";
import { parseTask } from "./claude.js";
import { getBusyPeriods } from "./calendar.js";
import { findTimeBlock } from "./scheduler.js";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const validateTwilio = config.TWILIO_AUTH_TOKEN && config.PUBLIC_BASE_URL
  ? twilio.webhook({ validate: true, url: `${config.PUBLIC_BASE_URL}/sms` })
  : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

app.post("/sms", validateTwilio, async (req, res) => {
  const response = new twilio.twiml.MessagingResponse();
  const body = typeof req.body.Body === "string" ? req.body.Body.trim() : "";
  if (!body) {
    response.message("Text me a task, like: ‘Finish the budget deck by Friday, about 90 minutes.’");
    return res.type("text/xml").send(response.toString());
  }
  try {
    const now = DateTime.now().setZone(config.TIME_ZONE);
    const task = await parseTask(body, {
      apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL,
      timeZone: config.TIME_ZONE, now
    });
    const horizon = now.plus({ days: config.SEARCH_DAYS }).endOf("day");
    const busy = await getBusyPeriods({
      clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET,
      refreshToken: config.GOOGLE_REFRESH_TOKEN, calendarId: config.GOOGLE_CALENDAR_ID,
      timeZone: config.TIME_ZONE, timeMin: now.toISO()!, timeMax: horizon.toISO()!
    });
    const block = findTimeBlock(task, busy, {
      timeZone: config.TIME_ZONE, workdayStart: config.WORKDAY_START,
      workdayEnd: config.WORKDAY_END, searchDays: config.SEARCH_DAYS, now
    });
    if (!block) {
      response.message(`I parsed “${task.title}” (${task.durationMinutes} min), but couldn't find an open workday slot in the next ${config.SEARCH_DAYS} days.`);
    } else {
      const start = DateTime.fromISO(block.start).setZone(config.TIME_ZONE);
      const end = DateTime.fromISO(block.end).setZone(config.TIME_ZONE);
      response.message(`Task: ${task.title} (${task.durationMinutes} min)\nSuggested: ${start.toFormat("ccc, LLL d · h:mm a")}–${end.toFormat("h:mm a")}\nNothing has been booked yet.`);
    }
  } catch (error) {
    console.error(error);
    response.message("I couldn't plan that task just now. Please try again in a moment.");
  }
  return res.type("text/xml").send(response.toString());
});

app.listen(config.PORT, () => console.log(`Listening on http://localhost:${config.PORT}`));
