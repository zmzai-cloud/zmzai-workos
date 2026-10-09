import type { AgentConversationDetail } from "./agent-client";
import { mergeMemoryReceipt } from "./memory-view";

type RefreshTicket = { generation: number; runId: string; request: number };

/** A response belongs to the Run visible when its request began. */
export class ConversationRefreshGuard {
  private generation = 0;
  private request = 0;
  constructor(private runId: string | null) {}

  capture(runId: string): RefreshTicket { return { generation: this.generation, runId, request: ++this.request }; }
  transition(runId: string): void { this.generation += 1; this.runId = runId; }
  isCurrent(ticket: RefreshTicket): boolean {
    return ticket.generation === this.generation && ticket.runId === this.runId && ticket.request === this.request;
  }
  accept(ticket: RefreshTicket, responseRunId: string | null): boolean {
    return this.isCurrent(ticket) && responseRunId === ticket.runId;
  }
}

export function reconcileConversationDetail(previous: AgentConversationDetail, incoming: AgentConversationDetail): AgentConversationDetail {
  return { ...incoming, memory: mergeMemoryReceipt(previous.memory, incoming.memory) };
}
