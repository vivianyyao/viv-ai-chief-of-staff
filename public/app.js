const form = document.querySelector("#task-form");
const input = document.querySelector("#message");
const submitButton = document.querySelector("#submit-button");
const results = document.querySelector("#results");
const thinking = document.querySelector("#thinking");
const thinkingMessage = document.querySelector("#thinking-message");
const errorBox = document.querySelector("#error");
const toast = document.querySelector("#toast");

const thinkingSteps = [
  "Understanding your request...",
  "Checking today's schedule...",
  "Looking for uninterrupted focus...",
  "Evaluating tradeoffs...",
  "Building a recommendation..."
];

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function playThinkingSequence() {
  for (const message of thinkingSteps) {
    thinkingMessage.textContent = message;
    thinkingMessage.style.animation = "none";
    thinkingMessage.offsetHeight;
    thinkingMessage.style.animation = "";
    await wait(620);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function renderResult(data) {
  document.querySelector("#reasoning-title").textContent = `Making room for “${data.task.title}”`;
  document.querySelector("#reasoning").replaceChildren(...data.reasoning.split("\n\n").map(text => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  }));

  if (!data.recommendation) throw new Error("Viv couldn't find a strong recommendation yet.");
  const recommendation = data.recommendation;
  document.querySelector("#recommendation-title").textContent = recommendation.title;
  document.querySelector("#recommendation-day").textContent = recommendation.dateLabel;
  document.querySelector("#recommendation-start").textContent = recommendation.startLabel;
  document.querySelector("#recommendation-end").textContent = recommendation.endLabel;
  document.querySelector("#confidence").textContent = recommendation.confidence;
  document.querySelector("#recommendation-reasons").replaceChildren(...recommendation.reasons.map(reason => {
    const item = document.createElement("li");
    item.textContent = reason;
    return item;
  }));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  results.hidden = true;
  thinking.hidden = false;
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Thinking";

  try {
    const responsePromise = fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.value })
    });
    const [, response] = await Promise.all([playThinkingSequence(), responsePromise]);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Viv couldn't think through that request.");
    renderResult(data);
    thinking.hidden = true;
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    thinking.hidden = true;
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Find a time";
  }
});

document.querySelector("#accept-button").addEventListener("click", () => {
  showToast("Noted. This is a preview, so nothing was changed.");
});
document.querySelector("#another-button").addEventListener("click", () => {
  showToast("Another-time options are coming next. Nothing was changed.");
});
