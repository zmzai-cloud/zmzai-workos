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

let cachedEnvironment: ServerEnvironment | null | undefined;

/**
 * 安全读取服务端环境。env 缺失/非法时不再让整站 500：
 * 返回 null，调用方降级为访客态（首页可渲染，dashboard 跳登录）。
 */
export function getServerEnvironment(): ServerEnvironment | null {
  if (cachedEnvironment !== undefined) return cachedEnvironment;
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[workos] env 校验失败，以访客态降级运行：", z.prettifyError(parsed.error));
    cachedEnvironment = null;
  } else {
    cachedEnvironment = parsed.data;
  }
  return cachedEnvironment;
}
