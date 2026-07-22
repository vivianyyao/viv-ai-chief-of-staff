import "dotenv/config";
import express from "express";
import twilio from "twilio";
import { interpretSmsLocally, interpretSmsWithClaude } from "./sms-interpreter.js";
import { isAllowedPhone, processSmsMessage, type SmsInterpreter } from "./sms-service.js";

type AppOptions = {
  allowedPhoneNumber: string;
  twilioAuthToken: string;
  publicBaseUrl: string;
  interpret: SmsInterpreter;
  localTestMode?: boolean;
};

export function createSmsApp(options: AppOptions) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.get("/health", (_req, res) => res.json({ ok: true }));

  if (options.localTestMode) {
    app.post("/local-test", async (req, res) => {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) return res.status(400).json({ error: "message is required" });
      try {
        return res.json(await processSmsMessage(message, options.interpret));
      } catch (error) {
        console.error("local sms test failed", error instanceof Error ? error.message : error);
        return res.status(502).json({ error: "viv couldn’t interpret that message." });
      }
    });
  }

  const validateTwilio = twilio.webhook(options.twilioAuthToken, {
    validate: true,
    url: `${options.publicBaseUrl.replace(/\/$/, "")}/sms`
  });

  app.post("/sms", (req, _res, next) => {
    console.log("twilio webhook reached viv");
    next();
  }, validateTwilio, async (req, res) => {
    const response = new twilio.twiml.MessagingResponse();
    if (!isAllowedPhone(req.body.From, options.allowedPhoneNumber)) {
      return res.status(403).type("text/xml").send(response.toString());
    }
    const message = typeof req.body.Body === "string" ? req.body.Body.trim() : "";
    if (!message) {
      response.message("tell me what’s on your mind.");
      return res.type("text/xml").send(response.toString());
    }
    try {
      console.log("viv is asking claude");
      const result = await processSmsMessage(message, options.interpret);
      console.log("viv reply is ready");
      response.message(result.reply);
    } catch (error) {
      console.error("sms interpretation failed", error instanceof Error ? error.message : error);
      response.message("i’m having trouble reading that right now. try me again in a moment.");
    }
    return res.type("text/xml").send(response.toString());
  });

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === "/sms") {
      console.error("twilio webhook rejected", error instanceof Error ? error.message : "signature validation failed");
    }
    if (res.headersSent) return next(error);
    return res.status(403).send("forbidden");
  });
  return app;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("your_")) throw new Error(`${name} is required`);
  return value;
}

if (process.env.NODE_ENV !== "test") {
  const localTestMode = process.env.LOCAL_TEST_MODE === "true";
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const interpret: SmsInterpreter = localTestMode && (!apiKey || apiKey.startsWith("your_"))
    ? async (message) => interpretSmsLocally(message)
    : async (message) => interpretSmsWithClaude(message, {
        apiKey: required("ANTHROPIC_API_KEY"),
        model: process.env.ANTHROPIC_MODEL
      });
  const app = createSmsApp({
    allowedPhoneNumber: localTestMode ? (process.env.ALLOWED_PHONE_NUMBER ?? "+15555550123") : required("ALLOWED_PHONE_NUMBER"),
    twilioAuthToken: localTestMode ? (process.env.TWILIO_AUTH_TOKEN ?? "local-test-token") : required("TWILIO_AUTH_TOKEN"),
    publicBaseUrl: localTestMode ? (process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:3001") : required("PUBLIC_BASE_URL"),
    interpret,
    localTestMode
  });
  const port = Number(process.env.PORT ?? (localTestMode ? 3001 : 3000));
  app.listen(port, "0.0.0.0", () => console.log(`viv sms is ready on port ${port}${localTestMode ? " (local test mode)" : ""}`));
}
