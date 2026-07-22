import express from "express";
import { join } from "node:path";
import { createDemoPlan } from "./demo.js";

export const demoApp = express();
demoApp.use(express.json());
demoApp.use(express.static(join(process.cwd(), "public")));
demoApp.post("/api/demo", (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Please type a task first." });
  return res.json(createDemoPlan(message));
});

if (process.env.NODE_ENV !== "test") {
  const port = 3000;
  const server = demoApp.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`\nViv is ready: ${url}\nPress Control + C when you are finished.`);
  });
  server.ref();
}
