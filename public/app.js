const form = document.querySelector("#task-form");
const input = document.querySelector("#message");
const submitButton = document.querySelector("#submit-button");
const results = document.querySelector("#results");
const thinking = document.querySelector("#thinking");
const thinkingMessage = document.querySelector("#thinking-message");
const errorBox = document.querySelector("#error");
const toast = document.querySelector("#toast");

const thinkingSteps = [
  "understanding your request...",
  "checking today's schedule...",
  "looking for uninterrupted focus...",
  "evaluating tradeoffs...",
  "building a recommendation..."
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
  document.querySelector("#reasoning-title").textContent = `making room for “${data.task.title}”`;
  const conciseReasoning = data.reasoning
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 4)
    .join(" ")
    .toLowerCase();
  const reasoningParagraph = document.createElement("p");
  reasoningParagraph.textContent = conciseReasoning;
  document.querySelector("#reasoning").replaceChildren(reasoningParagraph);

  if (!data.recommendation) throw new Error("Viv couldn't find a strong recommendation yet.");
  const recommendation = data.recommendation;
  document.querySelector("#recommendation-title").textContent = recommendation.title;
  document.querySelector("#recommendation-day").textContent = recommendation.dateLabel.toLowerCase();
  document.querySelector("#recommendation-start").textContent = recommendation.startLabel;
  document.querySelector("#recommendation-end").textContent = recommendation.endLabel;
  document.querySelector("#confidence").textContent = recommendation.confidence.toLowerCase();
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
    submitButton.querySelector("span").textContent = "thinking";

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
    submitButton.querySelector("span").textContent = "ask viv";
  }
});

document.querySelector("#accept-button").addEventListener("click", () => {
  showToast("noted. this is a preview, so nothing was changed.");
});
document.querySelector("#another-button").addEventListener("click", () => {
  showToast("another-time options are coming next. nothing was changed.");
});
