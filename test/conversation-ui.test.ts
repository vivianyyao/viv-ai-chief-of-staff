import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

describe("conversation-first browser experience", () => {
  it("keeps the message thread and restores the visual day plan", () => {
    expect(html).toContain('id="conversation"');
    expect(html).toContain('placeholder="text viv..."');
    expect(html).toContain("view-tabs");
    expect(html).toContain('data-view="plan" aria-selected="false">day</button>');
    expect(html).toContain('class="viv-mark"');
    expect(html).toContain('class="viv-mark-main"');
    expect(html).toContain('class="viv-mark-dot"');
    expect(html).toContain('<h1 class="sr-only">viv</h1>');
    expect(html).not.toContain('<h1>viv</h1>');
    expect(html).not.toContain('<div class="avatar" aria-hidden="true">v</div>');
    expect(css).toContain(".viv-mark");
    expect(html).toContain('id="plan-view"');
    expect(html).toContain('<h3 id="radar-title">radar</h3>');
    expect(html).toContain("day timeline from 06:00 to 00:00");
    expect(html).toContain("<time>17:00</time>");
    expect(html).not.toContain("captured from chat");
    expect(html).not.toContain("saved privately in this browser");
    expect(html).not.toContain("a quiet view of what’s on your day and what still needs a home");
    expect(html).not.toContain(">available<");
    expect(html).not.toContain("calendar connected · read only");
    expect(html).not.toContain("preview only");
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

  it("installs as a standalone phone app", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/viv-180.png">');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(app).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(manifest).toContain('"display": "standalone"');
    expect(manifest).toContain('"purpose": "any maskable"');
    expect(serviceWorker).toContain('const CACHE_NAME = "viv-assets-v2"');
    expect(serviceWorker).toContain('caches.match("/offline.html")');
    expect(serviceWorker).not.toContain('"/app.js"');
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
  });

  it("opens and returns to chat at the newest message", () => {
    expect(app).toContain('window.history.scrollRestoration = "manual"');
    expect(app).toContain('window.scrollTo({ top: document.documentElement.scrollHeight, behavior })');
    expect(app).toContain('window.addEventListener("pageshow", () => scrollToLatest("auto"))');
    expect(app).toContain('input.focus({ preventScroll: true })');
  });

  it("renders calendar blocks and opens their saved details", () => {
    expect(app).toContain("function renderSchedule()");
    expect(app).toContain("function openEventDetails(item)");
    expect(app).toContain('tab.addEventListener("click", () => switchView(tab.dataset.view))');
  });

  it("lets local schedule blocks move or delete while google stays read only", () => {
    expect(html).toContain('id="event-editor"');
    expect(html).toContain('id="event-edit-date"');
    expect(html).toContain('id="event-edit-start"');
    expect(html).toContain('id="event-edit-end"');
    expect(html).toContain('id="event-delete"');
    expect(app).toContain("function isEditableScheduleItem(item)");
    expect(app).toContain('eventEditor.addEventListener("submit"');
    expect(app).toContain('eventDelete.addEventListener("click"');
    expect(app).toContain("google calendar events are read only.");
    expect(css).toContain(".event-editor-grid");
  });

  it("hides old local-plan disclaimers saved in existing browser data", () => {
    expect(app).toContain("isVivBoilerplate");
    expect(app).toContain('"confirmed in your local plan. nothing was added to google calendar."');
    expect(app).toContain("if (!cleanedDetails || isVivBoilerplate)");
  });

  it("keeps task labels visible on short calendar blocks", () => {
    expect(app).toContain('block.classList.add("is-compact")');
    expect(app).toContain('item.title?.trim() || "busy"');
    expect(css).toContain(".schedule-block.is-compact");
  });

  it("visually separates google calendar events from tasks added through viv", () => {
    expect(app).toContain('item.source === "google"');
    expect(app).toContain('block.classList.add("is-google")');
    expect(css).toContain(".schedule-block.is-google");
  });

  it("lets radar tasks move up, move down, or be deleted", () => {
    expect(app).toContain("function moveRadarItem(item, direction)");
    expect(app).toContain("function deleteRadarItem(item)");
    expect(app).toContain('for (const [label, symbol, direction] of [["move up", "↑", -1], ["move down", "↓", 1]])');
    expect(app).toContain('remove.className = "radar-item-remove"');
    expect(app).toContain("plannerItems.splice(index, 1)");
    expect(css).toContain(".radar-item-controls");
  });

  it("persists the thread and sends only one morning brief per day", () => {
    expect(app).toContain('const memoryKey = "viv-local-memory-v1"');
    expect(app).toContain("morningBriefDate === todayIso");
    expect(app).toContain("localStorage.setItem(memoryKey");
  });

  it("keeps a proposed block pending until the user confirms it", () => {
    expect(app).toContain("pendingProposal");
    expect(app).toContain("function resolvePendingProposal(accepted)");
    expect(app).toContain("add it to your plan?");
    expect(app).toContain("function addProposalActions(row)");
    expect(app).toContain('row.classList.add("has-quick-replies")');
    expect(app).toContain('for (const label of ["yes", "no"])');
    expect(css).toContain(".message-row.has-quick-replies");
    expect(app).toContain('source: "confirmed"');
    expect(app).toContain('`added.\\n\\n${proposal.title}');
    expect(app).toContain("const reply = pendingProposal");
    expect(app).not.toContain("const reply = data.interpretation?.proposedTime");
    expect(app).not.toContain("it’s on your local plan. i didn’t change google calendar.");
  });

  it("moves between plan dates and reconciles confirmed tasks with the radar", () => {
    expect(html).toContain('id="previous-day"');
    expect(html).toContain('id="today-day"');
    expect(html).toContain('id="next-day"');
    expect(app).toContain("function selectPlanDate(value)");
    expect(app).toContain("function reconcilePlannerWithSchedule()");
    expect(app).toContain("function tasksMatch(first, second)");
    expect(app).toContain("resolvePlanDate(item.date) === selectedPlanDate");
    expect(app).toContain("loadCalendar(value, false)");
    expect(app).toContain("/api/calendar/today?date=${encodeURIComponent(date)}");
  });

  it("groups remembered items by how viv should hold them", () => {
    expect(app).toContain('["radar", null]');
    expect(app).toContain('["waiting", "waiting on"]');
    expect(app).toContain('["thinking", "thinking about"]');
    expect(app).toContain('["someday", "someday"]');
    expect(app).toContain("function radarCategoryFor(item)");
    expect(css).toContain(".radar-group");
  });

  it("removes duplicate finalized blocks for the same task and day", () => {
    expect(app).toContain("function deduplicateFinalizedSchedule()");
    expect(app).toContain('["confirmed", "conversation"].includes(item.source)');
    expect(app).toContain("deduplicateFinalizedSchedule();\nreconcilePlannerWithSchedule();");
  });

  it("restores a failed message to the composer instead of duplicating it", () => {
    expect(app).toContain("userRow.remove()");
    expect(app).toContain("input.value = message");
  });

  it("renders viv's saved replies in 24-hour time", () => {
    expect(app).toContain("function normalizeDisplayedTime(value)");
    expect(app).toContain('sender === "viv" ? normalizeDisplayedTime(text) : text');
  });
});
