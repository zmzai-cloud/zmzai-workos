import { cookies } from "next/headers";

import { SessionModel, UserModel, hashToken } from "@zmzai/db";

import { getServerEnvironment } from "@/config/env";
import { connectMongo } from "@/lib/database/mongodb";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

/** 校验 muzhi_session cookie（同库同 AUTH_SECRET，拒绝规则逐行对齐 zmzai-agent/lib/auth/session.ts）。 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const environment = getServerEnvironment();
  const token = (await cookies()).get(environment.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  await connectMongo();
  const session = await SessionModel.findOne({
    tokenHash: hashToken(environment.AUTH_SECRET, token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) return null;

  const user = await UserModel.findById(session.userId).lean();
  if (!user || user.status !== "active" || (!user.emailVerified && user.role !== "admin")) return null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
  };
}
