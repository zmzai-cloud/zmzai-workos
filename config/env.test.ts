import { afterEach, expect, it, vi } from "vitest";
import { memoryBankHref } from "@/lib/memory-view";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("defaults Memory Center links to the Memory product origin", async () => {
  vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/test");
  vi.stubEnv("AUTH_SECRET", "a".repeat(32));
  vi.stubEnv("WORKOS_SERVICE_SECRET_CURRENT", "b".repeat(32));
  vi.stubEnv("MEMORY_WEB_ORIGIN", undefined);
  vi.resetModules();
  const { getServerEnvironment } = await import("./env");
  expect(memoryBankHref(getServerEnvironment()?.MEMORY_WEB_ORIGIN ?? null, "ws_1")).toBe("https://memory.zmzai.cloud/banks/ws_1/memories");
});
