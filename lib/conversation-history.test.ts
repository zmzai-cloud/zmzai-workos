import { describe, expect, it } from "vitest";

import { preserveReplaySnapshot, toInitialMessages } from "./conversation-history";
import type { AgentConversationDetail } from "./agent-client";
import type { WorkosChatMessage } from "./agent-chat-transport";

describe("preserveReplaySnapshot", () => {
  const user = { id: "u1", role: "user", parts: [{ type: "text", text: "问题" }] } as WorkosChatMessage;
  const snapshot = { id: "run_1", role: "assistant", parts: [{ type: "text", text: "断线前已经显示的完整回复" }] } as WorkosChatMessage;

  it("重放追上原进度前保留旧回复，追上后切换到新流", () => {
    const empty = { ...snapshot, parts: [] } as WorkosChatMessage;
    const partial = { ...snapshot, parts: [{ type: "text", text: "断线前" }] } as WorkosChatMessage;
    const caughtUp = { ...snapshot, parts: [{ type: "text", text: "断线前已经显示的完整回复，并继续" }] } as WorkosChatMessage;

    expect(preserveReplaySnapshot([user, empty], snapshot)).toEqual([user, snapshot]);
    expect(preserveReplaySnapshot([user, partial], snapshot)).toEqual([user, snapshot]);
    const live = [user, caughtUp];
    expect(preserveReplaySnapshot(live, snapshot)).toBe(live);
  });
});

describe("toInitialMessages 轮分组", () => {
  const detail = (messages: unknown[], active = false) => ({ session: { id: "s", title: "t", workspaceId: "w" }, messages, latestRun: active ? { runId: "r", sessionId: "s", status: "running", active: true } : null }) as unknown as AgentConversationDetail;

  it("同轮多条 assistant 合并为一条，跨轮不并", () => {
    const out = toInitialMessages(detail([
      { id: "u1", role: "user", text: "问一", parts: [{ type: "text", id: "p1", text: "问一" }] },
      { id: "a1", role: "assistant", parts: [{ type: "tool", id: "t1", callId: "c1", tool: "read", state: { status: "completed" } }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", id: "p2", text: "中间说明" }] },
      { id: "a3", role: "assistant", parts: [{ type: "text", id: "p3", text: "最终答案" }] },
      { id: "u2", role: "user", parts: [{ type: "text", id: "p4", text: "问二" }] },
      { id: "a4", role: "assistant", parts: [{ type: "text", id: "p5", text: "答二" }] },
    ]));
    expect(out.map((m) => `${m.role}:${m.id}:${m.parts.length}`)).toEqual(["user:u1:1", "assistant:a1:3", "user:u2:1", "assistant:a4:1"]);
    const merged = out[1]!;
    expect(merged.parts.map((p) => p.type)).toEqual(["tool-read", "text", "text"]);
    expect((merged.parts[1] as { text: string }).text).toBe("中间说明");
  });

  it("活跃 Run：截到本轮用户消息为止", () => {
    const out = toInitialMessages(detail([
      { id: "u1", role: "user", parts: [{ type: "text", id: "p1", text: "问一" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", id: "p2", text: "答一" }] },
      { id: "u2", role: "user", parts: [{ type: "text", id: "p3", text: "问二" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", id: "p4", text: "半截" }] },
    ], true));
    expect(out.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("无 parts 的旧消息回退 text 字段", () => {
    const out = toInitialMessages(detail([{ id: "u1", role: "user", text: "旧消息" }]));
    expect((out[0]!.parts[0] as { text: string }).text).toBe("旧消息");
  });

  it("生产混合会话（8 消息）折成 4 条（两轮各一）", () => {
    // 取自生产 ses_97e4f67b 的结构精简（正文截断、工具只留状态）——
    // 混合多轮 + 一轮多消息（工具间隔产生的 assistant 分条）的真实形态。
    const messages = [
        {
            "id": "msg_0542c7f4-0ffe-4cb8-8270-77de0517fd23",
            "role": "user",
            "parts": [
                {
                    "type": "text",
                    "id": "prt_c362aff7-cf06-4ceb-9364-d027f0bf7dae",
                    "text": "继续讨论我的笔记《发布验收 1012：笔记联动与快捷写作》（"
                }
            ]
        },
        {
            "id": "msg_2b581a65-5cc8-4001-8d23-53ba1953ee0d",
            "role": "assistant",
            "parts": [
                {
                    "type": "tool",
                    "id": "prt_002385e7-fa15-455c-87cc-4b2156ac58a6",
                    "callId": "call_bf0e2c0e9d17411f95b32326",
                    "tool": "workos_read_note",
                    "state": {
                        "status": "completed",
                        "title": "示例"
                    }
                }
            ]
        },
        {
            "id": "msg_60277aab-e2ea-47b8-abfc-20c0a30a7ece",
            "role": "assistant",
            "parts": [
                {
                    "type": "text",
                    "id": "prt_2090dc87-2390-4790-8bec-d24cd9ed5bdd",
                    "text": "已经读到这篇笔记的最新内容（revision 4）。围绕「发"
                }
            ]
        },
        {
            "id": "msg_3556791f-1fc6-4963-8d7b-d0ec0e6b2e18",
            "role": "user",
            "parts": [
                {
                    "type": "text",
                    "id": "prt_b089121c-cc60-4a38-acc6-ea0e0c44d872",
                    "text": "处理笔记本身"
                }
            ]
        },
        {
            "id": "msg_5a14f871-a120-4e64-b610-1f658834a0a3",
            "role": "assistant",
            "parts": [
                {
                    "type": "tool",
                    "id": "prt_ea72e6c8-602a-42fb-b316-e00c241bbdec",
                    "callId": "call_5dcc2c6473b84763be114020",
                    "tool": "workos_read_note",
                    "state": {
                        "status": "completed",
                        "title": "示例"
                    }
                }
            ]
        },
        {
            "id": "msg_ca0bee64-9274-40af-b5e9-87d988aecf7b",
            "role": "assistant",
            "parts": [
                {
                    "type": "text",
                    "id": "prt_89895d02-61e1-4a8f-bdb0-84c2a1a0525e",
                    "text": "收到，那我来处理这篇笔记：**清理末尾的 \"hello\" 测"
                },
                {
                    "type": "tool",
                    "id": "prt_95992c2a-e8fa-436b-864e-f6b2ff043204",
                    "callId": "call_aec8aaa8d5ba4d218c0d4b88",
                    "tool": "workos_update_note",
                    "state": {
                        "status": "completed",
                        "title": "示例"
                    }
                }
            ]
        },
        {
            "id": "msg_f6818b8b-4e18-43cc-a29a-704c20f297db",
            "role": "assistant",
            "parts": [
                {
                    "type": "text",
                    "id": "prt_b9d566bd-2a6d-482c-a444-07604b53808f",
                    "text": "笔记已更新（revision 4 → 5）。现在这篇笔记是干"
                },
                {
                    "type": "tool",
                    "id": "prt_3320401c-83da-4667-ad6f-b5f337630de7",
                    "callId": "call_250684b88f394dfb8b28252b",
                    "tool": "task_deliver",
                    "state": {
                        "status": "completed",
                        "title": "示例"
                    }
                }
            ]
        },
        {
            "id": "msg_4c3bdcd1-3ed0-48c9-af83-041550153973",
            "role": "assistant",
            "parts": [
                {
                    "type": "text",
                    "id": "prt_cc0f2ca9-4bd1-45a3-be70-ee92c88553ca",
                    "text": "笔记处理已完成：我基于最新版本（revision 4）提交了"
                }
            ]
        }
    ];
    const out = toInitialMessages(detail(messages));
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const lastRound = out[3]!;
    expect(lastRound.parts.map((p) => p.type)).toEqual(["tool-workos_read_note", "text", "tool-workos_update_note", "text", "tool-task_deliver", "text"]);
  });
});
