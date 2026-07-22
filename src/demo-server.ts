import "dotenv/config";
import express from "express";
import { join } from "node:path";
import { createPlanFromTask, interpretLocally } from "./demo.js";
import { hasUsableAnthropicKey, interpretWithClaude, NeedsMoreDetailError } from "./interpreter.js";
import { DateTime } from "luxon";

export const demoApp = express();
demoApp.use(express.json());
demoApp.use(express.static(join(process.cwd(), "public")));
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
