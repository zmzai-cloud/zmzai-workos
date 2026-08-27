import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  findOne: vi.fn(),
  findById: vi.fn(),
  hashToken: vi.fn(),
  getEnv: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookiesGet }) }));
vi.mock("@zmzai/db", () => ({
  SessionModel: { findOne: mocks.findOne },
  UserModel: { findById: mocks.findById },
  hashToken: mocks.hashToken,
}));
vi.mock("@/config/env", () => ({ getServerEnvironment: mocks.getEnv }));
vi.mock("@/lib/database/mongodb", () => ({ connectMongo: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/session";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEnv.mockReturnValue({ SESSION_COOKIE_NAME: "muzhi_session", AUTH_SECRET: "secret-32-chars-aaaaaaaaaaaaaaaa" });
  mocks.cookiesGet.mockReturnValue({ value: "token-abc" });
  mocks.hashToken.mockReturnValue("hashed");
});

describe("getCurrentUser", () => {
  it("returns null when the cookie is absent", async () => {
    mocks.cookiesGet.mockReturnValue(undefined);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when the session does not match", async () => {
    mocks.findOne.mockReturnValue({ lean: async () => null });
    expect(await getCurrentUser()).toBeNull();
    expect(mocks.hashToken).toHaveBeenCalledWith("secret-32-chars-aaaaaaaaaaaaaaaa", "token-abc");
  });

  it("rejects users whose email is not verified (non-admin)", async () => {
    mocks.findOne.mockReturnValue({ lean: async () => ({ userId: "u1", expiresAt: new Date(Date.now() + 60_000) }) });
    mocks.findById.mockReturnValue({ lean: async () => ({ _id: "u1", name: "牧之", email: "m@example.com", status: "active", role: "user", emailVerified: false }) });
    expect(await getCurrentUser()).toBeNull();
  });

  it("accepts active verified users", async () => {
    mocks.findOne.mockReturnValue({ lean: async () => ({ userId: "u1", expiresAt: new Date(Date.now() + 60_000) }) });
    mocks.findById.mockReturnValue({ lean: async () => ({ _id: "u1", name: "牧之", email: "m@example.com", status: "active", role: "user", emailVerified: true }) });
    const user = await getCurrentUser();
    expect(user).toEqual({ id: "u1", name: "牧之", email: "m@example.com" });
  });

  it("accepts unverified admins", async () => {
    mocks.findOne.mockReturnValue({ lean: async () => ({ userId: "u1", expiresAt: new Date(Date.now() + 60_000) }) });
    mocks.findById.mockReturnValue({ lean: async () => ({ _id: "u1", name: "牧之", email: "m@example.com", status: "active", role: "admin", emailVerified: false }) });
    const user = await getCurrentUser();
    expect(user?.id).toBe("u1");
  });

  it("rejects non-active users", async () => {
    mocks.findOne.mockReturnValue({ lean: async () => ({ userId: "u1", expiresAt: new Date(Date.now() + 60_000) }) });
    mocks.findById.mockReturnValue({ lean: async () => ({ _id: "u1", name: "牧之", email: "m@example.com", status: "suspended", role: "user", emailVerified: true }) });
    expect(await getCurrentUser()).toBeNull();
  });
});
