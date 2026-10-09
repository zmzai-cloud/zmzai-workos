import { expect, it } from "vitest";
import type { AgentConversationDetail } from "./agent-client";
import { ConversationRefreshGuard, reconcileConversationDetail } from "./conversation-refresh";

const detail = (runId: string, status: string, updatedAt: string): AgentConversationDetail => ({
  session: { id: "ses_1", title: "对话", workspaceId: "ws_1" },
  messages: [{ id: `message_${runId}`, role: "assistant", text: runId, createdAt: 0 }],
  latestRun: { runId, sessionId: "ses_1", status: "succeeded", active: false },
  memory: { runId, bankId: "ws_1", recall: { status: "empty", hits: [] }, retention: { status, updatedAt } },
});

it("drops a prior Run response that resolves after a new Run starts", async () => {
  const guard = new ConversationRefreshGuard("run_1");
  const oldTicket = guard.capture("run_1");
  let resolveOld!: (value: AgentConversationDetail) => void;
  const oldResponse = new Promise<AgentConversationDetail>(resolve => { resolveOld = resolve; });
  guard.transition("run_2");
  let shown = detail("run_2", "pending", "2026-10-09T10:00:01Z");
  const newTicket = guard.capture("run_2");
  const fresh = detail("run_2", "succeeded", "2026-10-09T10:00:03Z");
  if (guard.accept(newTicket, fresh.latestRun?.runId ?? null)) shown = reconcileConversationDetail(shown, fresh);
  resolveOld(detail("run_1", "succeeded", "2026-10-09T10:00:00Z"));
  const arrived = await oldResponse;
  if (guard.accept(oldTicket, arrived.latestRun?.runId ?? null)) shown = reconcileConversationDetail(shown, arrived);
  expect(shown.latestRun?.runId).toBe("run_2");
  expect(shown.messages[0].text).toBe("run_2");
  expect(shown.memory?.runId).toBe("run_2");

  // A request sent for the new Run must also wait until Agent detail reports it.
  expect(guard.isCurrent(oldTicket)).toBe(false);
  expect(guard.accept(newTicket, "run_1")).toBe(false);
});

it("keeps persisted unknown when a late pending snapshot arrives for the same Run", () => {
  const guard = new ConversationRefreshGuard("run_2");
  const ticket = guard.capture("run_2");
  let shown = detail("run_2", "unknown", "2026-10-09T10:00:11Z");
  const delayed = detail("run_2", "pending", "2026-10-09T10:00:01Z");
  if (guard.accept(ticket, delayed.latestRun?.runId ?? null)) shown = reconcileConversationDetail(shown, delayed);
  expect(shown.memory?.retention.status).toBe("unknown");
});
