const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send-button");
const conversation = document.querySelector("#conversation");
const errorBox = document.querySelector("#error");
const viewTabs = document.querySelectorAll(".view-tab");
const chatView = document.querySelector("#chat-view");
const planView = document.querySelector("#plan-view");
const planDate = document.querySelector("#plan-date");
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
const history = [];
const plannerItems = [];
const scheduleItems = [];
let pendingPlannerIndex = null;

planDate.textContent = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric"
}).format(new Date()).toLowerCase();

function switchView(view) {
  const showingChat = view === "chat";
  chatView.hidden = !showingChat;
  planView.hidden = showingChat;
  viewTabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (showingChat) input.focus();
}

viewTabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
document.querySelector("[data-switch-to-chat]").addEventListener("click", () => switchView("chat"));

function plannerDetails(item) {
  const details = [];
  if (item.durationMinutes) {
    const hours = item.durationMinutes / 60;
    details.push(Number.isInteger(hours) && hours >= 1 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${item.durationMinutes} minutes`);
  }
  if (item.deadline) details.push(`due ${item.deadline}`);
  return details;
}

function renderPlanner() {
  radarCount.textContent = String(plannerItems.length);
  if (plannerItems.length === 0) return;

  radarList.replaceChildren(...plannerItems.map((item) => {
    const article = document.createElement("article");
    article.className = "radar-item";

    const status = document.createElement("span");
    status.className = `radar-status${item.needsClarification ? " needs-detail" : ""}`;
    status.textContent = item.needsClarification ? "needs a detail" : item.proposedTime ? "time proposed" : "unscheduled";

    const title = document.createElement("h4");
    title.textContent = item.taskOrRequest;

    const details = plannerDetails(item);
    article.append(status, title);
    if (details.length) {
      const meta = document.createElement("p");
      meta.textContent = details.join(" · ");
      article.append(meta);
    }
    return article;
  }));
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
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour >= 12 ? "pm" : "am"}`;
}

function renderEventDetails(details) {
  eventDialogDetails.replaceChildren();
  if (!details?.trim()) {
    eventDialogDetails.hidden = true;
    return;
  }
  eventDialogDetails.hidden = false;
  const parts = details.split(/(https?:\/\/[^\s]+)/g);
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

function openEventDetails(item) {
  eventDialogTitle.textContent = item.title;
  eventDialogDate.textContent = item.date ?? "today";
  eventDialogTime.textContent = `${displayTime(item.start)}–${displayTime(item.end)}`;
  renderEventDetails(item.details);
  eventDialog.showModal();
}

eventDialogClose.addEventListener("click", () => eventDialog.close());
eventDialog.addEventListener("click", (event) => {
  const bounds = eventDialog.getBoundingClientRect();
  const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!inside) eventDialog.close();
});

function renderSchedule() {
  scheduleLayer.replaceChildren(...scheduleItems.map((item) => {
    const start = timeToMinutes(item.start);
    const rawEnd = timeToMinutes(item.end);
    const end = start !== null && rawEnd !== null && rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
    const block = document.createElement("button");
    block.type = "button";
    block.className = `schedule-block${item.source === "proposal" ? " is-proposed" : ""}`;
    if (start !== null && end !== null) {
      block.style.top = `${Math.max(0, (start - 6 * 60) / 60 * 48)}px`;
      block.style.height = `${Math.max(30, (end - start) / 60 * 48)}px`;
    }
    const title = document.createElement("strong");
    title.textContent = item.title;
    const time = document.createElement("span");
    time.textContent = `${displayTime(item.start)}–${displayTime(item.end)}`;
    block.append(title, time);
    block.addEventListener("click", () => openEventDetails(item));
    return block;
  }));
}

function upsertScheduleItem(item) {
  const key = item.id
    ? `${item.source ?? "local"}|${item.id}`.toLowerCase()
    : `${item.date ?? "today"}|${item.start}|${item.title}`.toLowerCase();
  const existingIndex = scheduleItems.findIndex((existing) => {
    const existingKey = existing.id
      ? `${existing.source ?? "local"}|${existing.id}`.toLowerCase()
      : `${existing.date ?? "today"}|${existing.start}|${existing.title}`.toLowerCase();
    return existingKey === key;
  });
  if (existingIndex >= 0) scheduleItems[existingIndex] = item;
  else scheduleItems.push(item);
}

async function loadCalendar() {
  try {
    const response = await fetch("/api/calendar/today");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "calendar unavailable");
    if (!data.connected) {
      calendarStatus.lastChild.textContent = "calendar not connected";
      return;
    }
    for (const item of data.events ?? []) upsertScheduleItem(item);
    calendarStatus.classList.add("is-connected");
    calendarStatus.lastChild.textContent = "calendar connected · read only";
    renderSchedule();
  } catch (error) {
    calendarStatus.lastChild.textContent = /permission/i.test(error.message)
      ? "calendar reconnect needed"
      : "calendar unavailable";
  }
}

function captureScheduleItem(interpretation) {
  if (!interpretation?.shouldAddToPlan || !interpretation.planItemTitle || !interpretation.planItemStart || !interpretation.planItemEnd) return;
  const item = {
    title: interpretation.planItemTitle,
    date: interpretation.planItemDate,
    start: interpretation.planItemStart,
    end: interpretation.planItemEnd,
    details: interpretation.planItemDetails
  };
  upsertScheduleItem(item);
  renderSchedule();
}

function captureProposal(interpretation) {
  if (!interpretation?.taskOrRequest || !interpretation.proposedStart || !interpretation.proposedEnd) return;
  const normalizedTitle = interpretation.taskOrRequest.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  upsertScheduleItem({
    id: normalizedTitle,
    source: "proposal",
    title: interpretation.taskOrRequest,
    date: interpretation.proposedDate ?? "today",
    start: interpretation.proposedStart,
    end: interpretation.proposedEnd,
    details: "viv’s proposed time. not confirmed."
  });
  renderSchedule();
}

function captureForPlanner(interpretation) {
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
    const normalizedTitle = item.taskOrRequest.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existingIndex = plannerItems.findIndex((existing) =>
      existing.taskOrRequest.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedTitle
    );
    if (existingIndex >= 0) {
      plannerItems[existingIndex] = item;
      if (item.needsClarification) pendingPlannerIndex = existingIndex;
    } else {
      plannerItems.unshift(item);
      if (item.needsClarification) pendingPlannerIndex = 0;
    }
  }
  renderPlanner();
}

function scrollToLatest() {
  requestAnimationFrame(() => conversation.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" }));
}

function addMessage(text, sender) {
  const row = document.createElement("article");
  row.className = `message-row ${sender}-row`;
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}-message`;
  for (const block of text.split(/\n\n+/)) {
    const paragraph = document.createElement("p");
    paragraph.textContent = block;
    bubble.append(paragraph);
  }
  row.append(bubble);
  conversation.append(row);
  scrollToLatest();
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
  const priorConversation = history.slice(-8);
  history.push({ role: "user", content: message });
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
    captureForPlanner(data.interpretation);
    captureScheduleItem(data.interpretation);
    captureProposal(data.interpretation);
  } catch (error) {
    thinking.remove();
    errorBox.textContent = error.message;
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
input.focus();
loadCalendar();
