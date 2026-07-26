const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send-button");
const conversation = document.querySelector("#conversation");
const errorBox = document.querySelector("#error");
const viewTabs = document.querySelectorAll(".view-tab");
const chatView = document.querySelector("#chat-view");
const planView = document.querySelector("#plan-view");
const planDate = document.querySelector("#plan-date");
const planDayLabel = document.querySelector("#plan-day-label");
const previousDayButton = document.querySelector("#previous-day");
const todayDayButton = document.querySelector("#today-day");
const nextDayButton = document.querySelector("#next-day");
const radarList = document.querySelector("#radar-list");
const radarCount = document.querySelector("#radar-count");
const scheduleLayer = document.querySelector("#schedule-layer");
const calendarStatus = document.querySelector("#calendar-status");
const eventDialog = document.querySelector("#event-dialog");
const eventDialogClose = document.querySelector("#event-dialog-close");
const eventDialogTitle = document.querySelector("#event-dialog-title");
const eventDialogDate = document.querySelector("#event-dialog-date");
const eventDialogTime = document.querySelector("#event-dialog-time");
const eventDialogDetails = document.querySelector("#event-dialog-details");
const eventEditToggle = document.querySelector("#event-edit-toggle");
const eventEditor = document.querySelector("#event-editor");
const eventEditTitle = document.querySelector("#event-edit-title");
const eventEditWho = document.querySelector("#event-edit-who");
const eventEditWhere = document.querySelector("#event-edit-where");
const eventEditWhat = document.querySelector("#event-edit-what");
const eventEditWhy = document.querySelector("#event-edit-why");
const eventEditDate = document.querySelector("#event-edit-date");
const eventEditStart = document.querySelector("#event-edit-start");
const eventEditEnd = document.querySelector("#event-edit-end");
const eventEditorError = document.querySelector("#event-editor-error");
const eventDelete = document.querySelector("#event-delete");
const eventEditCancel = document.querySelector("#event-edit-cancel");
const eventReadonlyNote = document.querySelector("#event-readonly-note");
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

if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined));
}

function loadMemory() {
  try {
    const value = JSON.parse(localStorage.getItem(memoryKey) ?? "{}");
    return {
      history: Array.isArray(value.history) ? value.history.slice(-100) : [],
      plannerItems: Array.isArray(value.plannerItems) ? value.plannerItems.slice(0, 100) : [],
      scheduleItems: Array.isArray(value.scheduleItems) ? value.scheduleItems.slice(0, 100) : [],
      lastIntent: typeof value.lastIntent === "string" ? value.lastIntent : null,
      pendingAction: typeof value.pendingAction === "string" ? value.pendingAction : null,
      pendingProposal: value.pendingProposal && typeof value.pendingProposal === "object" ? value.pendingProposal : null,
      pendingEvent: value.pendingEvent && typeof value.pendingEvent === "object" ? value.pendingEvent : null,
      selectedPlanDate: typeof value.selectedPlanDate === "string" ? value.selectedPlanDate : null,
      morningBriefDate: typeof value.morningBriefDate === "string" ? value.morningBriefDate : null,
      morningBriefSource: typeof value.morningBriefSource === "string" ? value.morningBriefSource : null
    };
  } catch {
    return { history: [], plannerItems: [], scheduleItems: [], lastIntent: null, pendingAction: null, pendingProposal: null, pendingEvent: null, selectedPlanDate: null, morningBriefDate: null, morningBriefSource: null };
  }
}

const memory = loadMemory();
const history = memory.history;
const plannerItems = memory.plannerItems;
const scheduleItems = memory.scheduleItems.filter((item) => item?.source !== "google");
let lastIntent = memory.lastIntent;
let pendingAction = memory.pendingAction;
let pendingProposal = memory.pendingProposal;
let pendingEvent = memory.pendingEvent;
let editingScheduleItem = null;
let calendarRequestId = 0;
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
      pendingProposal,
      pendingEvent,
      selectedPlanDate,
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
let selectedPlanDate = /^\d{4}-\d{2}-\d{2}$/.test(memory.selectedPlanDate ?? "") ? memory.selectedPlanDate : todayIso;

function dateFromIso(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftIsoDate(value, amount) {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + amount);
  return toLocalIso(date);
}

function relativeDayLabel(value) {
  if (value === todayIso) return "today";
  if (value === shiftIsoDate(todayIso, 1)) return "tomorrow";
  if (value === shiftIsoDate(todayIso, -1)) return "yesterday";
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dateFromIso(value)).toLowerCase();
}

function renderPlanHeading() {
  planDayLabel.textContent = relativeDayLabel(selectedPlanDate);
  planDate.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(dateFromIso(selectedPlanDate)).toLowerCase();
  todayDayButton.classList.toggle("is-current", selectedPlanDate === todayIso);
}

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
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function switchView(view) {
  const showingChat = view === "chat";
  chatView.hidden = !showingChat;
  planView.hidden = showingChat;
  document.body.classList.toggle("showing-plan", !showingChat);
  viewTabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (showingChat) {
    input.focus({ preventScroll: true });
    scrollToLatest("auto");
  }
  else {
    renderPlanner();
    renderSchedule();
  }
}

viewTabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));

function selectPlanDate(value) {
  selectedPlanDate = value;
  renderPlanHeading();
  renderSchedule();
  saveMemory();
  loadCalendar(value, false);
}

previousDayButton.addEventListener("click", () => selectPlanDate(shiftIsoDate(selectedPlanDate, -1)));
todayDayButton.addEventListener("click", () => selectPlanDate(todayIso));
nextDayButton.addEventListener("click", () => selectPlanDate(shiftIsoDate(selectedPlanDate, 1)));

const taskStopWords = new Set(["a", "an", "and", "for", "my", "of", "the", "to"]);

function taskWords(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !taskStopWords.has(word));
}

function tasksMatch(first, second) {
  const firstWords = taskWords(first);
  const secondWords = taskWords(second);
  if (!firstWords.length || !secondWords.length) return false;
  const firstKey = firstWords.join(" ");
  const secondKey = secondWords.join(" ");
  if (firstKey === secondKey || firstKey.includes(secondKey) || secondKey.includes(firstKey)) return true;
  const secondSet = new Set(secondWords);
  const overlap = firstWords.filter((word) => secondSet.has(word)).length;
  return overlap >= Math.min(2, firstWords.length, secondWords.length);
}

function finalizedTaskKey(item) {
  const date = resolvePlanDate(item.date);
  const title = taskWords(item.title).join(" ");
  return title ? `${date}:${title}` : null;
}

function deduplicateFinalizedSchedule() {
  const winners = new Map();
  for (let index = 0; index < scheduleItems.length; index += 1) {
    const item = scheduleItems[index];
    if (!["confirmed", "conversation"].includes(item.source)) continue;
    const key = finalizedTaskKey(item);
    if (!key) continue;
    const existing = winners.get(key);
    const itemPriority = item.source === "confirmed" ? 2 : 1;
    const existingPriority = existing?.item.source === "confirmed" ? 2 : 1;
    if (!existing || itemPriority > existingPriority || itemPriority === existingPriority) {
      winners.set(key, { index, item });
    }
  }

  for (let index = scheduleItems.length - 1; index >= 0; index -= 1) {
    const item = scheduleItems[index];
    if (!["confirmed", "conversation"].includes(item.source)) continue;
    const key = finalizedTaskKey(item);
    if (key && winners.get(key)?.index !== index) scheduleItems.splice(index, 1);
  }
}

function scheduleSummary(item) {
  const date = item.date ?? todayIso;
  return `${relativeDayLabel(date)}, ${displayTime(item.start)}–${displayTime(item.end)}`;
}

function reconcilePlannerWithSchedule() {
  for (const item of plannerItems) {
    const confirmed = scheduleItems.find((entry) => entry.source === "confirmed" && tasksMatch(entry.title, item.taskOrRequest));
    const proposal = scheduleItems.find((entry) => entry.source === "proposal" && tasksMatch(entry.title, item.taskOrRequest));
    if (proposal) {
      item.proposedTime = scheduleSummary(proposal);
      item.confirmedTime = null;
    } else if (confirmed) {
      item.confirmedTime = scheduleSummary(confirmed);
      item.proposedTime = null;
    }
  }
}

function plannerDetails(item) {
  const details = [];
  if (item.confirmedTime) details.push(item.confirmedTime);
  else if (item.proposedTime) details.push(item.proposedTime);
  if (item.durationMinutes) {
    const hours = item.durationMinutes / 60;
    details.push(Number.isInteger(hours) && hours >= 1 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${item.durationMinutes} minutes`);
  }
  if (item.deadline && !details.some((detail) => detail.toLowerCase().includes(item.deadline.toLowerCase()))) details.push(item.deadline);
  return details;
}

function radarCategoryFor(item) {
  if (["radar", "waiting", "thinking", "someday"].includes(item.radarCategory)) return item.radarCategory;
  const text = String(item.taskOrRequest ?? "").toLowerCase();
  if (/\b(waiting|reply from|hear back|response from)\b/.test(text)) return "waiting";
  if (/\b(someday|one day|trip to|travel to|japan trip)\b/.test(text)) return "someday";
  if (/\b(thinking about|considering|maybe buy|buy passport photos)\b/.test(text)) return "thinking";
  return "radar";
}

function refreshRadarAfterEdit(pendingItem = null) {
  const nextPendingIndex = pendingItem ? plannerItems.indexOf(pendingItem) : -1;
  pendingPlannerIndex = nextPendingIndex >= 0 ? nextPendingIndex : null;
  renderPlanner();
  saveMemory();
  updateDeveloperPanel();
}

function moveRadarItem(item, direction) {
  const pendingItem = pendingPlannerIndex === null ? null : plannerItems[pendingPlannerIndex];
  const category = radarCategoryFor(item);
  const peers = plannerItems.filter((entry) => radarCategoryFor(entry) === category);
  const peerIndex = peers.indexOf(item);
  const other = peers[peerIndex + direction];
  if (!other) return;
  const itemIndex = plannerItems.indexOf(item);
  const otherIndex = plannerItems.indexOf(other);
  [plannerItems[itemIndex], plannerItems[otherIndex]] = [plannerItems[otherIndex], plannerItems[itemIndex]];
  refreshRadarAfterEdit(pendingItem);
}

function deleteRadarItem(item) {
  if (!window.confirm(`remove “${item.taskOrRequest}” from radar?`)) return;
  const pendingItem = pendingPlannerIndex === null ? null : plannerItems[pendingPlannerIndex];
  const index = plannerItems.indexOf(item);
  if (index < 0) return;
  plannerItems.splice(index, 1);
  if (pendingProposal && tasksMatch(pendingProposal.title, item.taskOrRequest)) {
    pendingProposal = null;
    clearProposalActions();
  }
  refreshRadarAfterEdit(pendingItem === item ? null : pendingItem);
}

function renderRadarItem(item) {
  const article = document.createElement("article");
  article.className = "radar-item";
  const row = document.createElement("div");
  row.className = "radar-item-row";
  const copy = document.createElement("div");
  copy.className = "radar-item-copy";
  const title = document.createElement("h5");
  title.textContent = item.taskOrRequest;
  copy.append(title);
  const details = plannerDetails(item);
  if (details.length) {
    const meta = document.createElement("p");
    meta.textContent = details.join(" · ");
    copy.append(meta);
  }
  const controls = document.createElement("div");
  controls.className = "radar-item-controls";
  const peers = plannerItems.filter((entry) => radarCategoryFor(entry) === radarCategoryFor(item));
  const peerIndex = peers.indexOf(item);
  for (const [label, symbol, direction] of [["move up", "↑", -1], ["move down", "↓", 1]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = symbol;
    button.setAttribute("aria-label", `${label}: ${item.taskOrRequest}`);
    button.disabled = direction < 0 ? peerIndex === 0 : peerIndex === peers.length - 1;
    button.addEventListener("click", () => moveRadarItem(item, direction));
    controls.append(button);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "radar-item-remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `delete: ${item.taskOrRequest}`);
  remove.addEventListener("click", () => deleteRadarItem(item));
  controls.append(remove);
  row.append(copy, controls);
  article.append(row);
  return article;
}

function renderPlanner() {
  radarCount.textContent = String(plannerItems.length);
  if (plannerItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "radar-empty";
    const title = document.createElement("span");
    title.textContent = "nothing here yet.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "go to chat";
    button.addEventListener("click", () => switchView("chat"));
    empty.append(title, button);
    radarList.replaceChildren(empty);
    return;
  }

  const groups = [
    ["radar", null],
    ["waiting", "waiting on"],
    ["thinking", "thinking about"],
    ["someday", "someday"]
  ];
  const sections = groups.flatMap(([category, label]) => {
    const items = plannerItems.filter((item) => radarCategoryFor(item) === category);
    if (!items.length) return [];
    const section = document.createElement("section");
    section.className = `radar-group radar-group-${category}`;
    const list = document.createElement("div");
    list.className = "radar-group-list";
    list.append(...items.map(renderRadarItem));
    if (label) {
      const heading = document.createElement("h4");
      heading.textContent = label;
      section.append(heading);
    }
    section.append(list);
    return [section];
  });
  radarList.replaceChildren(...sections);
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function displayTime(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return value;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDisplayedTime(value) {
  const convert = (rawHour, rawMinute, meridiem) => {
    let hour = Number(rawHour) % 12;
    if (String(meridiem).toLowerCase().startsWith("p")) hour += 12;
    return `${String(hour).padStart(2, "0")}:${rawMinute ?? "00"}`;
  };
  return value
    .replace(/\b(1[0-2]|0?\d)(?::([0-5]\d))?\s*[–-]\s*(1[0-2]|0?\d)(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
      (_match, startHour, startMinute, endHour, endMinute, meridiem) => `${convert(startHour, startMinute, meridiem)}–${convert(endHour, endMinute, meridiem)}`)
    .replace(/\b(1[0-2]|0?\d)(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
      (_match, rawHour, rawMinute, meridiem) => convert(rawHour, rawMinute, meridiem));
}

function renderEventDetails(details) {
  eventDialogDetails.replaceChildren();
  const cleanedDetails = details?.trim();
  const isVivBoilerplate = [
    "confirmed in your local plan. nothing was added to google calendar.",
    "scheduled through viv."
  ].includes(cleanedDetails?.toLowerCase());
  if (!cleanedDetails || isVivBoilerplate) {
    eventDialogDetails.hidden = true;
    return;
  }
  eventDialogDetails.hidden = false;
  const parts = cleanedDetails.split(/(https?:\/\/[^\s]+)/g);
  for (const part of parts) {
    if (/^https?:\/\//.test(part)) {
      const link = document.createElement("a");
      link.href = part;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = part;
      eventDialogDetails.append(link);
    } else {
      eventDialogDetails.append(document.createTextNode(part));
    }
  }
}

function parseEventContext(details) {
  const result = { who: "", where: "", what: "", why: "" };
  for (const line of String(details ?? "").split(/\n+/)) {
    const match = /^\s*(who|where|what|why)\s*:\s*(.*)$/i.exec(line);
    if (match) result[match[1].toLowerCase()] = match[2].trim();
  }
  return result;
}

function serializeEventContext() {
  return [
    ["who", eventEditWho.value.trim()],
    ["what", eventEditWhat.value.trim()],
    ["where", eventEditWhere.value.trim()],
    ["why", eventEditWhy.value.trim()]
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n") || null;
}

function isEditableScheduleItem(item) {
  return ["confirmed", "conversation"].includes(item?.source);
}

function openEventDetails(item) {
  editingScheduleItem = item;
  eventDialogTitle.textContent = item.title;
  const resolvedDate = resolvePlanDate(item.date);
  eventDialogDate.textContent = relativeDayLabel(resolvedDate);
  eventDialogTime.textContent = `${displayTime(item.start)}–${displayTime(item.end)}`;
  renderEventDetails(item.details);
  eventEditorError.hidden = true;
  const editable = isEditableScheduleItem(item);
  eventEditor.hidden = true;
  eventEditToggle.hidden = !editable;
  eventReadonlyNote.hidden = editable;
  if (editable) {
    const context = parseEventContext(item.details);
    eventEditTitle.value = item.title;
    eventEditWho.value = context.who;
    eventEditWhere.value = context.where;
    eventEditWhat.value = context.what;
    eventEditWhy.value = context.why;
    eventEditDate.value = resolvedDate;
    eventEditStart.value = item.start;
    eventEditEnd.value = item.end;
  } else {
    eventReadonlyNote.textContent = item.source === "google"
      ? "google calendar events are read only."
      : "confirm this proposal in chat before editing it.";
  }
  eventDialog.showModal();
}

eventEditToggle.addEventListener("click", () => {
  if (!isEditableScheduleItem(editingScheduleItem)) return;
  eventEditToggle.hidden = true;
  eventDialogDetails.hidden = true;
  eventEditor.hidden = false;
  eventEditTitle.focus();
});

eventEditCancel.addEventListener("click", () => {
  if (!editingScheduleItem) return;
  eventEditor.hidden = true;
  eventEditToggle.hidden = false;
  renderEventDetails(editingScheduleItem.details);
});

eventDialogClose.addEventListener("click", () => eventDialog.close());
eventDialog.addEventListener("close", () => { editingScheduleItem = null; });
eventDialog.addEventListener("click", (event) => {
  const bounds = eventDialog.getBoundingClientRect();
  const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!inside) eventDialog.close();
});

eventEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isEditableScheduleItem(editingScheduleItem)) return;
  const start = timeToMinutes(eventEditStart.value);
  const end = timeToMinutes(eventEditEnd.value);
  const title = eventEditTitle.value.trim();
  if (!title) {
    eventEditorError.textContent = "give this a short name.";
    eventEditorError.hidden = false;
    return;
  }
  if (!eventEditDate.value || start === null || end === null || end <= start) {
    eventEditorError.textContent = "end time needs to be after start time.";
    eventEditorError.hidden = false;
    return;
  }
  const key = editingScheduleItem._key ?? scheduleIdentity(editingScheduleItem);
  const stored = scheduleItems.find((item) => item._key === key);
  if (!stored) return;
  const previousTitle = stored.title;
  stored.title = title;
  stored.details = serializeEventContext();
  stored.date = eventEditDate.value;
  stored.start = eventEditStart.value;
  stored.end = eventEditEnd.value;
  selectedPlanDate = stored.date;
  setPlannerConfirmation(previousTitle, false);
  setPlannerConfirmation(stored.title, stored.source === "confirmed");
  reconcilePlannerWithSchedule();
  renderPlanHeading();
  renderSchedule();
  renderPlanner();
  saveMemory();
  updateDeveloperPanel();
  eventDialog.close();
});

eventDelete.addEventListener("click", () => {
  if (!isEditableScheduleItem(editingScheduleItem)) return;
  if (!window.confirm("delete this from your local day?")) return;
  const title = editingScheduleItem.title;
  const wasConfirmed = editingScheduleItem.source === "confirmed";
  removeScheduleItem(editingScheduleItem);
  if (wasConfirmed) setPlannerConfirmation(title, false);
  reconcilePlannerWithSchedule();
  renderSchedule();
  renderPlanner();
  saveMemory();
  updateDeveloperPanel();
  eventDialog.close();
});

function renderSchedule() {
  const selectedItems = scheduleItems.filter((item) => resolvePlanDate(item.date) === selectedPlanDate);
  scheduleLayer.replaceChildren(...selectedItems.map((item) => {
    const start = timeToMinutes(item.start);
    const rawEnd = timeToMinutes(item.end);
    const end = start !== null && rawEnd !== null && rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
    const block = document.createElement("button");
    block.type = "button";
    block.className = "schedule-block";
    if (item.source === "google") block.classList.add("is-google");
    if (item.source === "proposal") block.classList.add("is-proposed");
    if (start !== null && end !== null) {
      if (end - start <= 45) block.classList.add("is-compact");
      block.style.top = `${Math.max(0, (start - 6 * 60) / 60 * 48)}px`;
      block.style.height = `${Math.max(30, (end - start) / 60 * 48)}px`;
    }
    const title = document.createElement("strong");
    title.textContent = item.title?.trim() || "busy";
    const time = document.createElement("span");
    time.textContent = `${displayTime(item.start)}–${displayTime(item.end)}`;
    block.append(title, time);
    block.addEventListener("click", () => openEventDetails(item));
    return block;
  }));
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
    pendingRecommendation: pendingProposal
  }, null, 2);
}

function scrollToLatest(behavior = "smooth") {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }));
}

function addMessage(text, sender, { animate = true } = {}) {
  const row = document.createElement("article");
  row.className = `message-row ${sender}-row${animate ? "" : " restored"}`;
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}-message`;
  const displayedText = sender === "viv" ? normalizeDisplayedTime(text) : text;
  for (const block of displayedText.split(/\n\n+/)) {
    const paragraph = document.createElement("p");
    paragraph.textContent = block;
    bubble.append(paragraph);
  }
  row.append(bubble);
  conversation.append(row);
  scrollToLatest(animate ? "smooth" : "auto");
  return row;
}

function clearProposalActions() {
  conversation.querySelectorAll(".quick-replies").forEach((element) => {
    element.closest(".message-row")?.classList.remove("has-quick-replies");
    element.remove();
  });
}

function addProposalActions(row) {
  if (!row || !pendingProposal) return;
  clearProposalActions();
  row.classList.add("has-quick-replies");
  const actions = document.createElement("div");
  actions.className = "quick-replies";
  actions.setAttribute("aria-label", "respond to viv’s proposed time");
  for (const label of ["yes", "no"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-reply";
    button.textContent = label;
    button.addEventListener("click", () => {
      input.value = label;
      form.requestSubmit();
    });
    actions.append(button);
  }
  row.append(actions);
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
  let lastAssistantRow = null;
  for (const item of history) {
    if ((item.role === "user" || item.role === "assistant") && typeof item.content === "string") {
      const row = addMessage(item.content, item.role === "user" ? "user" : "viv", { animate: false });
      if (item.role === "assistant") lastAssistantRow = row;
    }
  }
  if (pendingProposal) addProposalActions(lastAssistantRow);
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

async function loadCalendar(date = selectedPlanDate, includeMorningBrief = date === todayIso) {
  const requestId = ++calendarRequestId;
  calendarStatus.querySelector("span").textContent = "checking calendar";
  try {
    const response = await fetch(`/api/calendar/today?date=${encodeURIComponent(date)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "calendar unavailable");
    if (data.connected && Array.isArray(data.events)) {
      for (let index = scheduleItems.length - 1; index >= 0; index -= 1) {
        if (scheduleItems[index].source === "google" && resolvePlanDate(scheduleItems[index].date) === date) scheduleItems.splice(index, 1);
      }
      for (const item of data.events) upsertScheduleItem({ ...item, source: "google" });
      calendarStatus.classList.add("is-connected");
      calendarStatus.querySelector("span").textContent = "calendar connected · read only";
      if (includeMorningBrief) ensureMorningBrief(data.events, true);
    } else {
      calendarStatus.querySelector("span").textContent = "calendar not connected";
      if (includeMorningBrief) ensureMorningBrief([], false);
    }
  } catch {
    if (requestId === calendarRequestId) calendarStatus.querySelector("span").textContent = "calendar unavailable";
    if (includeMorningBrief) ensureMorningBrief([], false);
  }
  renderSchedule();
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
  pendingEvent = null;
}

function captureProposal(interpretation) {
  if (!interpretation?.taskOrRequest || !interpretation.proposedStart || !interpretation.proposedEnd) return;
  const proposal = {
    id: interpretation.taskOrRequest.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    source: "proposal",
    title: interpretation.taskOrRequest,
    date: resolvePlanDate(interpretation.proposedDate),
    start: interpretation.proposedStart,
    end: interpretation.proposedEnd,
    details: "viv’s proposed time. waiting for your confirmation."
  };
  if (pendingProposal) removeScheduleItem(pendingProposal);
  pendingProposal = proposal;
  upsertScheduleItem(proposal);
}

function scheduleIdentity(item) {
  return `${item.source}:${item.id ?? `${item.date}:${item.start}:${item.title.toLowerCase()}`}`;
}

function removeScheduleItem(item) {
  const key = item?._key ?? scheduleIdentity(item);
  const index = scheduleItems.findIndex((entry) => entry._key === key);
  if (index >= 0) scheduleItems.splice(index, 1);
}

function removeFinalizedTask(title) {
  for (let index = scheduleItems.length - 1; index >= 0; index -= 1) {
    const entry = scheduleItems[index];
    if (["confirmed", "conversation"].includes(entry.source) && tasksMatch(entry.title, title)) scheduleItems.splice(index, 1);
  }
}

function setPlannerConfirmation(title, confirmed) {
  const item = plannerItems.find((entry) => tasksMatch(entry.taskOrRequest, title));
  if (!item) return;
  if (confirmed) {
    const confirmedItem = scheduleItems.find((entry) => entry.source === "confirmed" && tasksMatch(entry.title, title));
    item.confirmedTime = confirmedItem ? scheduleSummary(confirmedItem) : item.proposedTime;
    item.proposedTime = null;
  } else {
    item.proposedTime = null;
    item.confirmedTime = null;
  }
}

function resolvePendingProposal(accepted) {
  if (!pendingProposal) return null;
  const proposal = { ...pendingProposal };
  removeScheduleItem(proposal);
  if (accepted) {
    removeFinalizedTask(proposal.title);
    const confirmedItem = {
      ...proposal,
      source: "confirmed",
      details: "scheduled through viv."
    };
    upsertScheduleItem(confirmedItem);
    selectedPlanDate = confirmedItem.date;
  }
  setPlannerConfirmation(proposal.title, accepted);
  pendingProposal = null;
  pendingAction = null;
  lastIntent = accepted ? "confirm_proposal" : "reject_proposal";
  renderPlanner();
  renderSchedule();
  saveMemory();
  updateDeveloperPanel();
  return proposal;
}

function isAcceptance(message) {
  return /^(yes|yep|yeah|sure|ok|okay|accept|confirm|do it|add it|sounds good)[.!\s]*$/i.test(message);
}

function isRejection(message) {
  return /^(no|nope|cancel|never mind|nevermind|don['’]t)[.!\s]*$/i.test(message);
}

function captureTask(interpretation) {
  if (!interpretation || !["task", "request"].includes(interpretation.kind) || !interpretation.taskOrRequest) return;
  if (interpretation.kind === "request" && interpretation.durationMinutes === null && !interpretation.needsClarification) return;
  const item = {
    taskOrRequest: interpretation.taskOrRequest,
    radarCategory: interpretation.radarCategory ?? "radar",
    durationMinutes: interpretation.durationMinutes,
    deadline: interpretation.deadline,
    needsClarification: interpretation.needsClarification,
    proposedTime: interpretation.proposedTime
  };
  if (pendingPlannerIndex !== null) {
    plannerItems[pendingPlannerIndex] = { ...plannerItems[pendingPlannerIndex], ...item };
    pendingPlannerIndex = item.needsClarification ? pendingPlannerIndex : null;
  } else {
    const existingIndex = plannerItems.findIndex((entry) => tasksMatch(entry.taskOrRequest, item.taskOrRequest));
    if (existingIndex >= 0) plannerItems[existingIndex] = { ...plannerItems[existingIndex], ...item };
    else plannerItems.unshift(item);
    if (item.needsClarification) pendingPlannerIndex = existingIndex >= 0 ? existingIndex : 0;
  }
}

function updateStateFromInterpretation(interpretation) {
  lastIntent = interpretation.intent ?? ({ task: "new_task", request: "advice_request", context: "personal_context" }[interpretation.kind] ?? "general_conversation");
  if (interpretation.needsClarification) pendingAction = interpretation.clarificationQuestion ?? "waiting for one detail";
  else if (interpretation.proposedTime) pendingAction = `proposal: ${interpretation.proposedTime}`;
  else pendingAction = null;
  if (interpretation?.planItemTitle && interpretation?.planItemStart && interpretation?.needsClarification && !interpretation?.shouldAddToPlan) {
    pendingEvent = {
      title: interpretation.planItemTitle,
      date: interpretation.planItemDate ?? null,
      start: interpretation.planItemStart,
      end: interpretation.planItemEnd ?? null,
      who: interpretation.planItemWho ?? null,
      where: interpretation.planItemWhere ?? null,
      what: interpretation.planItemWhat ?? null,
      why: interpretation.planItemWhy ?? null,
      details: interpretation.planItemDetails ?? null
    };
  }
  captureTask(interpretation);
  captureScheduleItem(interpretation);
  captureProposal(interpretation);
  deduplicateFinalizedSchedule();
  reconcilePlannerWithSchedule();
  renderPlanner();
  renderSchedule();
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
  const userRow = addMessage(message, "user");
  const priorConversation = history.slice(-10);
  history.push({ role: "user", content: message });
  saveMemory();
  input.value = "";
  resizeInput();

  if (pendingProposal && (isAcceptance(message) || isRejection(message))) {
    clearProposalActions();
    const accepted = isAcceptance(message);
    const proposal = resolvePendingProposal(accepted);
    const reply = accepted
      ? `added.\n\n${proposal.title}\n${proposal.date === todayIso ? "today" : proposal.date}\n${displayTime(proposal.start)}–${displayTime(proposal.end)}`
      : "okay. i’ve removed that proposed time.\n\nnothing was changed.";
    addMessage(reply, "viv");
    history.push({ role: "assistant", content: reply });
    renderPlanHeading();
    saveMemory();
    input.focus();
    return;
  }

  sendButton.disabled = true;
  clearProposalActions();
  const thinking = addThinking();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation: priorConversation, plan: scheduleItems, radar: plannerItems, pendingProposal, pendingEvent })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "i couldn’t make sense of that just now.");
    thinking.remove();
    updateStateFromInterpretation(data.interpretation);
    const reply = pendingProposal
      ? `${data.reply}\n\nadd it to your plan?`
      : data.reply;
    const vivRow = addMessage(reply, "viv");
    history.push({ role: "assistant", content: reply });
    if (pendingProposal) addProposalActions(vivRow);
  } catch (error) {
    thinking.remove();
    userRow.remove();
    if (history.at(-1)?.role === "user" && history.at(-1)?.content === message) history.pop();
    input.value = message;
    resizeInput();
    saveMemory();
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

deduplicateFinalizedSchedule();
reconcilePlannerWithSchedule();
renderPlanHeading();
restoreConversation();
scrollToLatest("auto");
renderPlanner();
renderSchedule();
saveMemory();
updateDeveloperPanel();
loadCalendar(todayIso, true).then(() => {
  if (selectedPlanDate !== todayIso) loadCalendar(selectedPlanDate, false);
});
input.focus({ preventScroll: true });
window.addEventListener("pageshow", () => scrollToLatest("auto"));
