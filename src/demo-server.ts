import "dotenv/config";
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { createPlanFromTask, interpretLocally } from "./demo.js";
import { hasUsableAnthropicKey, interpretWithClaude, NeedsMoreDetailError } from "./interpreter.js";
import { DateTime } from "luxon";
import { applyRadarMemory, interpretSmsLocally, interpretSmsWithClaude, resolveFatigueSchedulingFollowUp, type PendingPlanItem, type RadarItem } from "./sms-interpreter.js";
import { processSmsMessage, writeVivReply, type SmsInterpreter } from "./sms-service.js";
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
    const radarCategory = "radarCategory" in entry && ["radar", "waiting", "thinking", "someday"].includes(String(entry.radarCategory))
      ? entry.radarCategory as "radar" | "waiting" | "thinking" | "someday"
      : null;
    const durationMinutes = "durationMinutes" in entry && typeof entry.durationMinutes === "number"
      ? Math.max(5, Math.min(480, Math.round(entry.durationMinutes)))
      : null;
    const deadline = "deadline" in entry && typeof entry.deadline === "string"
      ? entry.deadline.trim().slice(0, 80)
      : null;
    const needsClarification = "needsClarification" in entry && entry.needsClarification === true;
    return taskOrRequest ? [{
      taskOrRequest,
      ...(radarCategory ? { radarCategory } : {}),
      durationMinutes,
      deadline: deadline || null,
      needsClarification
    }] : [];
  });
}

export function normalizePendingEvent(input: unknown): PendingPlanItem | null {
  if (!input || typeof input !== "object") return null;
  const text = (key: string, limit: number) => key in input && typeof input[key as keyof typeof input] === "string"
    ? String(input[key as keyof typeof input]).trim().slice(0, limit) || null
    : null;
  const title = text("title", 120);
  const start = text("start", 20);
  if (!title || !start || !/^\d{2}:\d{2}$/.test(start)) return null;
  const end = text("end", 20);
  return {
    title,
    date: text("date", 40),
    start,
    end: end && /^\d{2}:\d{2}$/.test(end) ? end : null,
    who: text("who", 160),
    where: text("where", 200),
    what: text("what", 240),
    why: text("why", 240),
    details: text("details", 800)
  };
}

function displayTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function buildScheduleReply(plan: LocalPlanItem[]): string {
  if (plan.length === 0) return "i don’t have anything fixed on your day yet.";
  const agenda = [...plan]
    .sort((left, right) => left.start.localeCompare(right.start))
    .map((item) => `${displayTime(item.start)}–${displayTime(item.end)}\n${item.title}`)
    .join("\n\n");
  return `here’s what i have for today:\n\n${agenda}`;
}

const SESSION_COOKIE = "viv_session";

type AccessEnvironment = Record<string, string | undefined>;

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSessionToken(secret: string, expiresAt: number): string {
  const expiry = String(Math.floor(expiresAt));
  const signature = createHmac("sha256", secret).update(expiry).digest("hex");
  return `${expiry}.${signature}`;
}

export function isValidSessionToken(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const [expiry, signature, extra] = token.split(".");
  if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Number(expiry) <= now) return false;
  return safeEqual(createSessionToken(secret, Number(expiry)), token);
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function getAccessConfig(env: AccessEnvironment = process.env) {
  const password = env.VIV_ACCESS_PASSWORD?.trim() ?? "";
  const sessionSecret = env.VIV_SESSION_SECRET?.trim() ?? "";
  const passwordReady = Boolean(password && !password.startsWith("choose_"));
  const secretReady = Boolean(sessionSecret && !sessionSecret.startsWith("generate_"));
  const sessionDays = Math.max(1, Math.min(90, Number(env.VIV_SESSION_DAYS ?? 30) || 30));
  return {
    enabled: passwordReady && secretReady,
    misconfigured: passwordReady !== secretReady,
    password,
    sessionSecret,
    sessionDays
  };
}

function loginPage(hasError = false): string {
  const error = hasError ? '<p class="error">that password didn’t match. try again.</p>' : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f1e8">
  <title>open viv</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100svh; margin: 0; display: grid; place-items: center; padding: 24px; color: #262622; background: #f5f1e8; }
    main { width: min(100%, 390px); }
    .mark { width: 68px; height: 68px; display: grid; place-items: center; margin-bottom: 34px; border-radius: 22px; color: #fffaf1; background: #22221f; font: italic 700 36px Georgia, serif; box-shadow: 0 18px 45px rgba(42, 38, 30, .14); }
    h1 { margin: 0 0 10px; font-size: clamp(32px, 8vw, 44px); letter-spacing: -.045em; }
    .intro { margin: 0 0 32px; color: #77736b; font-size: 17px; line-height: 1.55; }
    form { display: grid; gap: 14px; }
    label { color: #77736b; font-size: 14px; }
    input { width: 100%; border: 1px solid #d8d1c4; border-radius: 18px; padding: 17px 18px; color: #262622; background: #fffdf9; font: inherit; font-size: 17px; outline: none; }
    input:focus { border-color: #7eaa91; box-shadow: 0 0 0 4px rgba(126, 170, 145, .15); }
    button { border: 0; border-radius: 18px; padding: 17px 18px; color: #fff; background: #262622; font: inherit; font-weight: 650; cursor: pointer; }
    .error { margin: 2px 0 0; color: #a54b40; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">v</div>
    <h1>hi, vivian.</h1>
    <p class="intro">enter your private password to open viv.</p>
    <form method="post" action="/login">
      <label for="password">password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      ${error}
      <button type="submit">open viv</button>
    </form>
  </main>
</body>
</html>`;
}

export const demoApp = express();
demoApp.use(express.json());
demoApp.use(express.urlencoded({ extended: false }));

demoApp.get("/health", (_req, res) => res.json({ ok: true }));

demoApp.get("/login", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("html").send(loginPage(req.query.error === "1"));
});

demoApp.post("/login", (req, res) => {
  const access = getAccessConfig();
  const supplied = typeof req.body?.password === "string" ? req.body.password : "";
  if (!access.enabled || !safeEqual(supplied, access.password)) return res.redirect(303, "/login?error=1");
  const maxAgeSeconds = access.sessionDays * 24 * 60 * 60;
  const token = createSessionToken(access.sessionSecret, Date.now() + maxAgeSeconds * 1000);
  const secure = process.env.NODE_ENV === "production" || process.env.PUBLIC_BASE_URL?.startsWith("https://");
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`);
  return res.redirect(303, "/");
});

demoApp.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return res.redirect(303, "/login");
});

demoApp.use((req, res, next) => {
  const access = getAccessConfig();
  if (access.misconfigured) return res.status(503).send("viv’s private access settings are incomplete.");
  if (!access.enabled) return next();
  const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
  if (isValidSessionToken(token, access.sessionSecret)) return next();
  res.set("Cache-Control", "no-store");
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "please unlock viv again." });
  return res.redirect(303, "/login");
});

demoApp.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
  next();
});
demoApp.use(express.static(join(process.cwd(), "public")));

export function calendarDayRange(value: unknown, timeZone: string, now = DateTime.now().setZone(timeZone)) {
  if (value !== undefined && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return null;
  const requested = typeof value === "string" ? DateTime.fromISO(value, { zone: timeZone }) : now.startOf("day");
  if (!requested.isValid) return null;
  const start = requested.startOf("day");
  return { date: start.toISODate()!, timeMin: start.toISO()!, timeMax: start.plus({ days: 1 }).toISO()! };
}

demoApp.get("/api/calendar/today", async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const usable = [clientId, clientSecret, refreshToken].every((value) => value && !value.startsWith("your_"));
  if (!usable) return res.json({ connected: false, events: [] });
  const timeZone = process.env.TIME_ZONE ?? "America/Los_Angeles";
  const now = DateTime.now().setZone(timeZone);
  const range = calendarDayRange(req.query.date, timeZone, now);
  if (!range) return res.status(400).json({ connected: false, events: [], error: "choose a valid calendar date." });
  try {
    const events = await getCalendarEvents({
      clientId: clientId!,
      clientSecret: clientSecret!,
      refreshToken: refreshToken!,
      calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
      timeZone,
      timeMin: range.timeMin,
      timeMax: range.timeMax
    });
    return res.json({ connected: true, readOnly: true, date: range.date, timeZone, events });
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
  const pendingEvent = normalizePendingEvent(req.body?.pendingEvent);
  const fatigueFollowUp = resolveFatigueSchedulingFollowUp(message, radar, plan);
  if (/\b(?:what(?:'s| is)|show|tell me).*(?:full )?(?:schedule|calendar|on my day)\b/i.test(message)) {
    return res.json({
      interpretation: {
        kind: "request", intent: "advice_request", taskOrRequest: "review today’s schedule",
        durationMinutes: null, deadline: "today", needsClarification: false, clarificationQuestion: null
      },
      reply: buildScheduleReply(plan),
      interpreter: "local"
    });
  }
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const usesClaude = Boolean(apiKey && !apiKey.startsWith("your_"));
    if (usesClaude) {
      try {
        const interpret: SmsInterpreter = (text) => interpretSmsWithClaude(text, { apiKey: apiKey!, model: process.env.ANTHROPIC_MODEL, conversation, plan, radar, pendingEvent });
        const result = await processSmsMessage(message, interpret);
        return res.json({ ...result, interpreter: "claude" });
      } catch (error) {
        console.error("Viv Claude interpretation failed; using local fallback", error instanceof Error ? error.message : error);
      }
    }
    if (fatigueFollowUp) {
      return res.json({
        interpretation: fatigueFollowUp,
        reply: writeVivReply(fatigueFollowUp),
        interpreter: usesClaude ? "local-fallback" : "local"
      });
    }
    const result = await processSmsMessage(message, async (text) => applyRadarMemory(interpretSmsLocally(text), radar));
    return res.json({ ...result, interpreter: usesClaude ? "local-fallback" : "local" });
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
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const access = getAccessConfig();
  if ((host === "0.0.0.0" || process.env.NODE_ENV === "production") && !access.enabled) {
    throw new Error("VIV_ACCESS_PASSWORD and VIV_SESSION_SECRET are required before Viv can be hosted.");
  }
  const server = demoApp.listen(port, host, () => {
    const visibleHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    const url = `http://${visibleHost}:${port}`;
    console.log(`\nViv is ready: ${url}\nPress Control + C when you are finished.`);
  });
  server.ref();
  const keepAlive = setInterval(() => undefined, 60_000);
  server.on("close", () => clearInterval(keepAlive));
}
