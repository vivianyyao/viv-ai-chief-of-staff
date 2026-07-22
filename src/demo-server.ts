import "dotenv/config";
import express from "express";
import { join } from "node:path";
import { createPlanFromTask, interpretLocally } from "./demo.js";
import { hasUsableAnthropicKey, interpretWithClaude, NeedsMoreDetailError } from "./interpreter.js";
import { DateTime } from "luxon";
import { interpretSmsLocally, interpretSmsWithClaude, type RadarItem } from "./sms-interpreter.js";
import { processSmsMessage, type SmsInterpreter } from "./sms-service.js";
import { getCalendarEvents } from "./calendar.js";

export type LocalPlanItem = {
  title: string;
  date: string | null;
  start: string;
  end: string;
  details: string | null;
};

export function normalizeLocalPlan(input: unknown): LocalPlanItem[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const title = "title" in entry && typeof entry.title === "string" ? entry.title.trim().slice(0, 120) : "";
    const date = "date" in entry && typeof entry.date === "string" ? entry.date.trim().slice(0, 40) : null;
    const start = "start" in entry && typeof entry.start === "string" ? entry.start.trim().slice(0, 20) : "";
    const end = "end" in entry && typeof entry.end === "string" ? entry.end.trim().slice(0, 20) : "";
    const details = "details" in entry && typeof entry.details === "string" ? entry.details.trim().slice(0, 800) : null;
    return title && /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end)
      ? [{ title, date: date || null, start, end, details: details || null }]
      : [];
  });
}

export function normalizeRadar(input: unknown): RadarItem[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const taskOrRequest = "taskOrRequest" in entry && typeof entry.taskOrRequest === "string"
      ? entry.taskOrRequest.trim().slice(0, 160)
      : "";
    const durationMinutes = "durationMinutes" in entry && typeof entry.durationMinutes === "number"
      ? Math.max(5, Math.min(480, Math.round(entry.durationMinutes)))
      : null;
    const deadline = "deadline" in entry && typeof entry.deadline === "string"
      ? entry.deadline.trim().slice(0, 80)
      : null;
    const needsClarification = "needsClarification" in entry && entry.needsClarification === true;
    return taskOrRequest ? [{ taskOrRequest, durationMinutes, deadline: deadline || null, needsClarification }] : [];
  });
}

export const demoApp = express();
demoApp.use(express.json());
demoApp.use(express.static(join(process.cwd(), "public")));
demoApp.get("/api/calendar/today", async (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const usable = [clientId, clientSecret, refreshToken].every((value) => value && !value.startsWith("your_"));
  if (!usable) return res.json({ connected: false, events: [] });
  const timeZone = process.env.TIME_ZONE ?? "America/Los_Angeles";
  const now = DateTime.now().setZone(timeZone);
  try {
    const events = await getCalendarEvents({
      clientId: clientId!,
      clientSecret: clientSecret!,
      refreshToken: refreshToken!,
      calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
      timeZone,
      timeMin: now.startOf("day").toISO()!,
      timeMax: now.plus({ days: 1 }).startOf("day").toISO()!
    });
    return res.json({ connected: true, readOnly: true, date: now.toISODate(), timeZone, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "calendar read failed";
    console.error("Viv calendar read failed", message);
    const needsReconnect = /scope|permission|insufficient|unauthorized|invalid_grant/i.test(message);
    return res.status(needsReconnect ? 403 : 502).json({
      connected: false,
      needsReconnect,
      events: [],
      error: needsReconnect ? "calendar permission needs to be refreshed." : "calendar is unavailable right now."
    });
  }
});
demoApp.post("/api/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "tell me what’s on your mind." });
  const conversation = Array.isArray(req.body?.conversation)
    ? req.body.conversation.slice(-8).flatMap((entry: unknown) => {
        if (!entry || typeof entry !== "object") return [];
        const role = "role" in entry ? entry.role : undefined;
        const content = "content" in entry ? entry.content : undefined;
        return (role === "user" || role === "assistant") && typeof content === "string" && content.trim()
          ? [{ role, content: content.trim().slice(0, 1000) }]
          : [];
      })
    : [];
  const plan = normalizeLocalPlan(req.body?.plan);
  const radar = normalizeRadar(req.body?.radar);
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const usesClaude = Boolean(apiKey && !apiKey.startsWith("your_"));
    const interpret: SmsInterpreter = usesClaude
      ? (text) => interpretSmsWithClaude(text, { apiKey: apiKey!, model: process.env.ANTHROPIC_MODEL, conversation, plan, radar })
      : async (text) => interpretSmsLocally(text);
    const result = await processSmsMessage(message, interpret);
    return res.json({ ...result, interpreter: usesClaude ? "claude" : "local" });
  } catch (error) {
    console.error("Viv chat failed", error instanceof Error ? error.message : error);
    return res.status(502).json({ error: "i’m having trouble reading that right now. try me again in a moment." });
  }
});
demoApp.post("/api/demo", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Please type a task first." });
  try {
    const now = DateTime.now().setZone(process.env.TIME_ZONE ?? "America/Los_Angeles");
    const usesClaude = hasUsableAnthropicKey();
    const task = usesClaude
      ? await interpretWithClaude(message, { now })
      : interpretLocally(message, now);
    return res.json({ ...createPlanFromTask(task, now), interpreter: usesClaude ? "claude" : "local" });
  } catch (error) {
    if (error instanceof NeedsMoreDetailError) return res.status(422).json({ error: error.message });
    console.error("Viv interpretation failed", error instanceof Error ? error.message : error);
    return res.status(502).json({ error: "viv couldn't make sense of that just now. try again in a moment." });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = 3000;
  const server = demoApp.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`\nViv is ready: ${url}\nPress Control + C when you are finished.`);
  });
  server.ref();
  const keepAlive = setInterval(() => undefined, 60_000);
  server.on("close", () => clearInterval(keepAlive));
}
