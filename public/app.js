const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send-button");
const conversation = document.querySelector("#conversation");
const errorBox = document.querySelector("#error");
const developerPanel = document.querySelector("#developer-panel");
const developerToggle = document.querySelector("#developer-toggle");
const developerClose = document.querySelector("#developer-close");
const resetButton = document.querySelector("#reset-conversation");
const devIntent = document.querySelector("#dev-intent");
const devPending = document.querySelector("#dev-pending");
const devCalendarSource = document.querySelector("#dev-calendar-source");
const devTasks = document.querySelector("#dev-tasks");
const devSchedule = document.querySelector("#dev-schedule");
const devState = document.querySelector("#dev-state");
const memoryKey = "viv-local-memory-v1";

function loadMemory() {
  try {
    const value = JSON.parse(localStorage.getItem(memoryKey) ?? "{}");
    return {
      history: Array.isArray(value.history) ? value.history.slice(-100) : [],
      plannerItems: Array.isArray(value.plannerItems) ? value.plannerItems.slice(0, 100) : [],
      scheduleItems: Array.isArray(value.scheduleItems) ? value.scheduleItems.slice(0, 100) : [],
      lastIntent: typeof value.lastIntent === "string" ? value.lastIntent : null,
      pendingAction: typeof value.pendingAction === "string" ? value.pendingAction : null,
      morningBriefDate: typeof value.morningBriefDate === "string" ? value.morningBriefDate : null,
      morningBriefSource: typeof value.morningBriefSource === "string" ? value.morningBriefSource : null
    };
  } catch {
    return { history: [], plannerItems: [], scheduleItems: [], lastIntent: null, pendingAction: null, morningBriefDate: null, morningBriefSource: null };
  }
}

const memory = loadMemory();
const history = memory.history;
const plannerItems = memory.plannerItems;
const scheduleItems = memory.scheduleItems.filter((item) => item?.source !== "google");
let lastIntent = memory.lastIntent;
let pendingAction = memory.pendingAction;
let morningBriefDate = memory.morningBriefDate;
let morningBriefSource = memory.morningBriefSource;
let pendingPlannerIndex = plannerItems.findIndex((item) => item?.needsClarification);
if (pendingPlannerIndex < 0) pendingPlannerIndex = null;

function saveMemory() {
  try {
    localStorage.setItem(memoryKey, JSON.stringify({
      history: history.slice(-100),
      plannerItems: plannerItems.slice(0, 100),
      scheduleItems: scheduleItems.filter((item) => item?.source !== "google").slice(0, 100),
      lastIntent,
      pendingAction,
      morningBriefDate,
      morningBriefSource
    }));
  } catch {
    // Viv can still work when private browser storage is unavailable.
  }
}

function toLocalIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const todayIso = toLocalIso(new Date());

function resolvePlanDate(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "today") return todayIso;
  const date = new Date();
  if (normalized === "tomorrow") {
    date.setDate(date.getDate() + 1);
    return toLocalIso(date);
  }
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = weekdays.indexOf(normalized);
  if (weekday >= 0) {
    let daysAhead = (weekday - date.getDay() + 7) % 7;
    if (daysAhead === 0) daysAhead = 7;
    date.setDate(date.getDate() + daysAhead);
    return toLocalIso(date);
  }
  return value;
}

function formatTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function updateDeveloperPanel() {
  devIntent.textContent = lastIntent ?? "none yet";
  devPending.textContent = pendingAction ?? "nothing pending";
  devCalendarSource.textContent = morningBriefSource ?? "checking";
  devTasks.textContent = JSON.stringify(plannerItems, null, 2);
  devSchedule.textContent = JSON.stringify(scheduleItems, null, 2);
  devState.textContent = JSON.stringify({
    recentMessages: history.slice(-6),
    pendingClarification: pendingPlannerIndex === null ? null : plannerItems[pendingPlannerIndex]?.taskOrRequest,
    pendingRecommendation: pendingAction
  }, null, 2);
}

function scrollToLatest(behavior = "smooth") {
  requestAnimationFrame(() => conversation.lastElementChild?.scrollIntoView({ behavior, block: "end" }));
}

function addMessage(text, sender, { animate = true } = {}) {
  const row = document.createElement("article");
  row.className = `message-row ${sender}-row${animate ? "" : " restored"}`;
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}-message`;
  for (const block of text.split(/\n\n+/)) {
    const paragraph = document.createElement("p");
    paragraph.textContent = block;
    bubble.append(paragraph);
  }
  row.append(bubble);
  conversation.append(row);
  scrollToLatest(animate ? "smooth" : "auto");
  return row;
}

function addThinking() {
  const row = document.createElement("article");
  row.className = "message-row viv-row thinking-row";
  row.innerHTML = '<div class="message viv-message typing"><span></span><span></span><span></span><small>viv is thinking</small></div>';
  conversation.append(row);
  scrollToLatest();
  return row;
}

function restoreConversation() {
  for (const item of history) {
    if ((item.role === "user" || item.role === "assistant") && typeof item.content === "string") {
      addMessage(item.content, item.role === "user" ? "user" : "viv", { animate: false });
    }
  }
}

function buildMorningBrief(events, connected) {
  if (connected && events.length > 0) {
    const agenda = events.slice(0, 4).map((event) => `${formatTime(event.start)}  ${event.title}`).join("\n");
    const remaining = events.length > 4 ? `\n\nand ${events.length - 4} more thing${events.length - 4 === 1 ? "" : "s"} later.` : "";
    return `good morning.\n\nhere’s what’s already on your day:\n\n${agenda}${remaining}\n\nanything changed?`;
  }
  if (connected) {
    return "good morning.\n\nyour calendar is clear today.\n\nwhat matters most?";
  }
  return "good morning.\n\nhere’s what i’d focus on today:\n\n9:00  finish the application\n11:00  interview prep\n2:00  call mom\n\nthe application is the main thing at risk of slipping.\n\nanything changed?";
}

function ensureMorningBrief(events, connected) {
  if (morningBriefDate === todayIso) return;
  const brief = buildMorningBrief(events, connected);
  history.push({ role: "assistant", content: brief });
  morningBriefDate = todayIso;
  morningBriefSource = connected ? "google calendar · read only" : "seeded simulation";
  addMessage(brief, "viv");
  saveMemory();
  updateDeveloperPanel();
}

async function loadCalendar() {
  try {
    const response = await fetch("/api/calendar/today");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "calendar unavailable");
    if (data.connected && Array.isArray(data.events)) {
      scheduleItems.push(...data.events.map((item) => ({ ...item, source: "google" })));
      ensureMorningBrief(data.events, true);
    } else {
      ensureMorningBrief([], false);
    }
  } catch {
    ensureMorningBrief([], false);
  }
  updateDeveloperPanel();
}

function upsertScheduleItem(item) {
  const key = `${item.source}:${item.id ?? `${item.date}:${item.start}:${item.title.toLowerCase()}`}`;
  const existingIndex = scheduleItems.findIndex((entry) => entry._key === key);
  const stored = { ...item, _key: key };
  if (existingIndex >= 0) scheduleItems[existingIndex] = stored;
  else scheduleItems.push(stored);
}

function captureScheduleItem(interpretation) {
  if (!interpretation?.shouldAddToPlan || !interpretation.planItemTitle || !interpretation.planItemStart || !interpretation.planItemEnd) return;
  upsertScheduleItem({
    id: interpretation.planItemTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    source: "conversation",
    title: interpretation.planItemTitle,
    date: resolvePlanDate(interpretation.planItemDate),
    start: interpretation.planItemStart,
    end: interpretation.planItemEnd,
    details: interpretation.planItemDetails ?? null
  });
}

function captureProposal(interpretation) {
  if (!interpretation?.taskOrRequest || !interpretation.proposedStart || !interpretation.proposedEnd) return;
  upsertScheduleItem({
    id: interpretation.taskOrRequest.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    source: "proposal",
    title: interpretation.taskOrRequest,
    date: resolvePlanDate(interpretation.proposedDate),
    start: interpretation.proposedStart,
    end: interpretation.proposedEnd,
    details: "viv’s proposed time. not confirmed."
  });
}

function captureTask(interpretation) {
  if (!interpretation || !["task", "request"].includes(interpretation.kind) || !interpretation.taskOrRequest) return;
  if (interpretation.kind === "request" && interpretation.durationMinutes === null && !interpretation.needsClarification) return;
  const item = {
    taskOrRequest: interpretation.taskOrRequest,
    durationMinutes: interpretation.durationMinutes,
    deadline: interpretation.deadline,
    needsClarification: interpretation.needsClarification,
    proposedTime: interpretation.proposedTime
  };
  if (pendingPlannerIndex !== null) {
    plannerItems[pendingPlannerIndex] = item;
    pendingPlannerIndex = item.needsClarification ? pendingPlannerIndex : null;
  } else {
    const normalized = item.taskOrRequest.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existingIndex = plannerItems.findIndex((entry) => entry.taskOrRequest.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalized);
    if (existingIndex >= 0) plannerItems[existingIndex] = item;
    else plannerItems.unshift(item);
    if (item.needsClarification) pendingPlannerIndex = existingIndex >= 0 ? existingIndex : 0;
  }
}

function updateStateFromInterpretation(interpretation) {
  lastIntent = interpretation.intent ?? ({ task: "new_task", request: "advice_request", context: "personal_context" }[interpretation.kind] ?? "general_conversation");
  if (interpretation.needsClarification) pendingAction = interpretation.clarificationQuestion ?? "waiting for one detail";
  else if (interpretation.proposedTime) pendingAction = `proposal: ${interpretation.proposedTime}`;
  else pendingAction = null;
  captureTask(interpretation);
  captureScheduleItem(interpretation);
  captureProposal(interpretation);
  saveMemory();
  updateDeveloperPanel();
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || sendButton.disabled) return;
  errorBox.hidden = true;
  addMessage(message, "user");
  const priorConversation = history.slice(-10);
  history.push({ role: "user", content: message });
  saveMemory();
  input.value = "";
  resizeInput();
  sendButton.disabled = true;
  const thinking = addThinking();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation: priorConversation, plan: scheduleItems, radar: plannerItems })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "i couldn’t make sense of that just now.");
    thinking.remove();
    addMessage(data.reply, "viv");
    history.push({ role: "assistant", content: data.reply });
    updateStateFromInterpretation(data.interpretation);
  } catch (error) {
    thinking.remove();
    errorBox.textContent = error instanceof Error ? error.message : "something got in the way. try that again.";
    errorBox.hidden = false;
  } finally {
    sendButton.disabled = false;
    input.focus();
  }
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

developerToggle.addEventListener("click", () => { updateDeveloperPanel(); developerPanel.showModal(); });
developerClose.addEventListener("click", () => developerPanel.close());
developerPanel.addEventListener("click", (event) => { if (event.target === developerPanel) developerPanel.close(); });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    if (developerPanel.open) developerPanel.close();
    else { updateDeveloperPanel(); developerPanel.showModal(); }
  }
});
resetButton.addEventListener("click", () => {
  if (!window.confirm("reset this local conversation?")) return;
  localStorage.removeItem(memoryKey);
  window.location.reload();
});

restoreConversation();
updateDeveloperPanel();
loadCalendar();
input.focus();
