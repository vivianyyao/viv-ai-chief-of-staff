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
const history = [];
const plannerItems = [];
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
    status.textContent = item.needsClarification ? "needs a detail" : "unscheduled";

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

function captureForPlanner(interpretation) {
  if (!interpretation || interpretation.kind !== "task" || !interpretation.taskOrRequest) return;
  const item = {
    taskOrRequest: interpretation.taskOrRequest,
    durationMinutes: interpretation.durationMinutes,
    deadline: interpretation.deadline,
    needsClarification: interpretation.needsClarification
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
      body: JSON.stringify({ message, conversation: priorConversation })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "i couldn’t make sense of that just now.");
    thinking.remove();
    addMessage(data.reply, "viv");
    history.push({ role: "assistant", content: data.reply });
    captureForPlanner(data.interpretation);
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
