import { describe, expect, test } from "bun:test"
import { ConfirmTool } from "../../src/tool/confirm"
import { Pending } from "../../src/tool/pending"
import type { Tool } from "../../src/tool/tool"
import type { MessageV2 } from "../../src/session/message-v2"

function user(sessionID: string, id: string): MessageV2.WithParts {
  return {
    info: {
      id,
      sessionID,
      role: "user",
      time: {
        created: Date.now(),
      },
      agent: "build",
      model: {
        providerID: "opencode",
        modelID: "test",
      },
    },
    parts: [],
  }
}

function ctx(sessionID: string, messageID: string, messages: MessageV2.WithParts[]): Tool.Context {
  return {
    sessionID,
    messageID,
    agent: "build",
    abort: new AbortController().signal,
    callID: "call_test",
    messages,
    metadata() {},
    async ask() {},
  }
}

describe("tool.confirm", () => {
  test("executes a staged entry and consumes it", async () => {
    const sessionID = "ses_test"
    const conversationKey = "msg_user"
    const messages = [user(sessionID, conversationKey)]
    const tool = await ConfirmTool.init()

    Pending.clearSession(sessionID)
    const id = Pending.put({
      sessionID,
      conversationKey,
      tool: "bash",
      impact: "unknown",
      run: async () => ({
        title: "ok",
        metadata: {},
        output: "done",
      }),
    })

    const result = await tool.execute({ id }, ctx(sessionID, "msg_assistant", messages))
    expect(result.output).toBe("done")
    expect(result.title).toContain("Confirmed bash")

    await expect(tool.execute({ id }, ctx(sessionID, "msg_assistant", messages))).rejects.toThrow(
      "confirm: staged id not found or expired",
    )
  })

  test("uses the last user message id as conversation key", async () => {
    const sessionID = "ses_test"
    const messages = [user(sessionID, "msg_a"), user(sessionID, "msg_b")]
    const tool = await ConfirmTool.init()

    Pending.clearSession(sessionID)
    const id = Pending.put({
      sessionID,
      conversationKey: "msg_b",
      tool: "bash",
      impact: "unknown",
      run: async () => ({
        title: "ok",
        metadata: {},
        output: "done",
      }),
    })

    const result = await tool.execute({ id }, ctx(sessionID, "msg_assistant", messages))
    expect(result.output).toBe("done")
  })

  test("rejects when no user message is present", async () => {
    const tool = await ConfirmTool.init()
    await expect(tool.execute({ id: "tool_missing" }, ctx("ses_test", "msg_assistant", []))).rejects.toThrow(
      "confirm: no user message found",
    )
  })
})
