import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default("muzhi_session"),
  AGENT_INTERNAL_URL: z.string().url().default("https://a.zmzai.cloud"),
  // 与 zmzai-agent 双侧同名；轮换窗口期可另配 PREVIOUS。
  WORKOS_SERVICE_SECRET_CURRENT: z.string().min(32),
  WORKOS_SERVICE_SECRET_PREVIOUS: optionalString,
  AUTH_LOGIN_URL: z.string().url().default("https://auth.zmzai.cloud/login"),
});

export type ServerEnvironment = z.infer<typeof environmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  cachedEnvironment ??= environmentSchema.parse(process.env);
  return cachedEnvironment;
}
