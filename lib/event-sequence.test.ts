import { expect, it } from "vitest";
import { acceptEvent } from "./event-sequence";
it("deduplicates replayed events by run and sequence", () => {
  const seen = new Set<string>();
  expect(acceptEvent(seen, "run_1", 3)).toBe(true);
  expect(acceptEvent(seen, "run_1", 3)).toBe(false);
  expect(acceptEvent(seen, "run_2", 3)).toBe(true);
});
