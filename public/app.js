const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send-button");
const conversation = document.querySelector("#conversation");
const errorBox = document.querySelector("#error");

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
  input.value = "";
  resizeInput();
  sendButton.disabled = true;
  const thinking = addThinking();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "i couldn’t make sense of that just now.");
    thinking.remove();
    addMessage(data.reply, "viv");
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
