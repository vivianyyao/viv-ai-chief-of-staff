import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

describe("conversation-first browser experience", () => {
  it("shows one message thread without dashboard navigation", () => {
    expect(html).toContain('id="conversation"');
    expect(html).toContain('placeholder="text viv..."');
    expect(html).not.toContain("view-tabs");
    expect(html).not.toContain("plan-view");
    expect(html).not.toContain("on viv’s radar");
  });

  it("keeps development state hidden in a dialog", () => {
    expect(html).toContain('<dialog id="developer-panel"');
    expect(html).toContain('id="dev-intent"');
    expect(html).toContain('id="reset-conversation"');
  });

  it("has a phone layout and a fixed multiline composer", () => {
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("position: fixed");
    expect(app).toContain('event.key === "Enter" && !event.shiftKey');
  });

  it("persists the thread and sends only one morning brief per day", () => {
    expect(app).toContain('const memoryKey = "viv-local-memory-v1"');
    expect(app).toContain("morningBriefDate === todayIso");
    expect(app).toContain("localStorage.setItem(memoryKey");
  });
});
