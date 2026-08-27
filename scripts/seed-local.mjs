// 本地 E2E 种子脚本：向本地 Mongo（zmzai_local 库）写入
// users / sessions / ZmzaiAgentWorkspace / ZmzaiAgentTask 数据，
// 并把明文 session token 写到 /tmp/workos-token.txt 供浏览器注入。
// 运行：node scripts/seed-local.mjs
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import mongoose from "mongoose";

const AUTH_SECRET = "local-dev-secret-0123456789abcdef0123456789";
const URI = "mongodb://127.0.0.1:27017/zmzai_local?replicaSet=rs0";

function hashToken(secret, token) {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    emailVerified: { type: Boolean, default: false },
  },
  { strict: "throw", timestamps: true },
);

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  { strict: "throw", timestamps: true },
);

const workspaceSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    currentRevisionId: { type: String, default: null },
    defaultModel: { type: String, required: true },
    approvalMode: { type: String, enum: ["ask", "auto", "always"], default: "ask" },
    prompt: { type: String, default: "" },
    steps: { type: Number, default: 12 },
    tools: { type: [String], default: [] },
    skillIds: { type: [String], default: [] },
    pluginIds: { type: [String], default: [] },
    connectorIds: { type: [String], default: [] },
    knowledgeBase: { type: [{ entryId: String, title: String, content: String }], default: [] },
    permission: { type: [{ permission: String, pattern: String, action: String }], default: [] },
  },
  { strict: "throw", timestamps: true },
);

const taskSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true, unique: true },
    workspaceId: { type: String, required: true },
    projectId: { type: String, default: null },
    parentTaskId: { type: String, default: null },
    sourceTaskVersionId: { type: String, default: null },
    userId: { type: String, required: true },
    source: { type: String, default: "chat" },
    title: { type: String, required: true },
    goal: { type: String, required: true },
    outputSchema: { type: mongoose.Schema.Types.Mixed, default: null },
    structuredOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    outputContractError: { type: String, default: null },
    status: { type: String, enum: ["draft", "active", "succeeded", "failed", "cancelled"], default: "draft" },
    activeRunId: { type: String, default: null },
    latestRunId: { type: String, default: null },
    version: { type: Number, default: 1 },
  },
  { strict: "throw", timestamps: true },
);

const uri = new URL(URI);
uri.searchParams.delete("replicaSet");
const directUri = uri.toString();

const conn = await mongoose.createConnection(URI, { serverSelectionTimeoutMS: 8_000 }).asPromise().catch(async () => {
  // rs0 未初始化时直连发起 replSetInitiate 后重试
  const admin = await mongoose.createConnection(directUri, { serverSelectionTimeoutMS: 8_000 }).asPromise();
  try {
    await admin.admin.command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] } });
  } catch (error) {
    if (!String(error?.message ?? "").includes("already initialized")) throw error;
  }
  await admin.close();
  // 等副本集选出 PRIMARY
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  return mongoose.createConnection(URI, { serverSelectionTimeoutMS: 8_000 }).asPromise();
});

const User = conn.model("User", userSchema);
const Session = conn.model("Session", sessionSchema);
const Workspace = conn.model("ZmzaiAgentWorkspace", workspaceSchema);
const Task = conn.model("ZmzaiAgentTask", taskSchema);

const email = "muzhi@example.com";
let user = await User.findOne({ email }).lean();
if (!user) user = await User.create({ name: "牧之", email, passwordHash: "seed-only", role: "user", status: "active", emailVerified: true });

const token = randomBytes(32).toString("base64url");
await Session.deleteMany({ userId: user._id });
await Session.create({ userId: user._id, tokenHash: hashToken(AUTH_SECRET, token), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) });

await Workspace.deleteMany({ userId: String(user._id) });
await Workspace.create([
  {
    workspaceId: "ws_seed_1", userId: String(user._id), name: "写作智能体", description: "起草与润色", defaultModel: "gpt-4o",
    knowledgeBase: [
      { entryId: "e1", title: "API 规范", content: "REST 命名规范……" },
      { entryId: "e2", title: "编码规范", content: "TypeScript 严格模式……" },
      { entryId: "e3", title: "业务术语", content: "知末智云产品矩阵……" },
    ],
  },
  {
    workspaceId: "ws_seed_2", userId: String(user._id), name: "研究智能体", description: "检索与摘要", defaultModel: "gpt-4o-mini",
    knowledgeBase: [{ entryId: "e4", title: "信源清单", content: "……" }],
  },
]);

await Task.deleteMany({ userId: String(user._id) });
await Task.create([
  { taskId: "task_seed_1", workspaceId: "ws_seed_1", userId: String(user._id), title: "发布本周产品周报", goal: "整理本周进展", status: "active" },
  { taskId: "task_seed_2", workspaceId: "ws_seed_2", userId: String(user._id), title: "竞品模型网关调研", goal: "输出对比表", status: "succeeded" },
  { taskId: "task_seed_3", workspaceId: "ws_seed_1", userId: String(user._id), title: "教程第 9 期大纲", goal: "生成大纲", status: "failed" },
  { taskId: "task_seed_4", workspaceId: "ws_seed_1", userId: String(user._id), title: "品牌色卡整理", goal: "整理色卡", status: "draft" },
]);

writeFileSync("/tmp/workos-token.txt", token, { mode: 0o600 });
console.log("seeded user", String(user._id), "token -> /tmp/workos-token.txt");
await conn.close();
