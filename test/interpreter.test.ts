import { describe, expect, it } from "vitest";
import { hasUsableAnthropicKey, interpretWithClaude, NeedsMoreDetailError, validateClaudeTask } from "../src/interpreter.js";

describe("Claude task validation", () => {
  it("accepts the expected structured task and allows a missing duration", () => {
    expect(validateClaudeTask({
      title: "Finish the budget deck",
      durationMinutes: null,
      deadline: null,
      priority: "high",
      intent: "schedule_task"
    })).toEqual({
      title: "Finish the budget deck",
      durationMinutes: null,
      deadline: null,
      priority: "high",
      intent: "schedule_task"
    });
  });

  it("rejects malformed or non-scheduling output", () => {
    expect(() => validateClaudeTask({ title: "hello", intent: "chat" })).toThrow(NeedsMoreDetailError);
  });

  it("detects a missing API key without making a network request", async () => {
    expect(hasUsableAnthropicKey("")).toBe(false);
    expect(hasUsableAnthropicKey("your_anthropic_api_key_here")).toBe(false);
    await expect(interpretWithClaude("Finish the deck", { apiKey: "" })).rejects.toThrow("ANTHROPIC_API_KEY is not configured");
  });
});
