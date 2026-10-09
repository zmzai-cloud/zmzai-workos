import { randomUUID } from "node:crypto";

/** 与 goal_/ses_/run_ 一致的非可复用短 id：前缀 + 20 位 hex。 */
export function newDomainId(prefix: "note" | "todo" | "act"): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}
