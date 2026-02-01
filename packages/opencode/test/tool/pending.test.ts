import { describe, expect, test } from "bun:test"
import { Pending } from "../../src/tool/pending"
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

describe("tool.pending", () => {
  test("conversationKey returns the last user message id", () => {
    const sessionID = "ses_test"
    const messages = [user(sessionID, "msg_a"), user(sessionID, "msg_b")]
    expect(Pending.conversationKey(messages)).toBe("msg_b")
  })

  test("conversationKey returns undefined when absent", () => {
    const messages: MessageV2.WithParts[] = []
    expect(Pending.conversationKey(messages)).toBeUndefined()
  })

  test("put/get/take are scoped to session + conversation", async () => {
    const sessionA = "ses_a"
    const sessionB = "ses_b"
    const convoA = "msg_a"
    const convoB = "msg_b"

    Pending.clearSession(sessionA)
    Pending.clearSession(sessionB)

    const run = async () => ({ title: "", metadata: {}, output: "ok" })
    const idA = Pending.put({ sessionID: sessionA, conversationKey: convoA, tool: "bash", impact: "unknown", run })
    const idB = Pending.put({ sessionID: sessionA, conversationKey: convoB, tool: "bash", impact: "unknown", run })

    expect(Pending.get(sessionA, convoA, idA)?.id).toBe(idA)
    expect(Pending.get(sessionA, convoA, idB)).toBeUndefined()
    expect(Pending.get(sessionB, convoA, idA)).toBeUndefined()

    expect(Pending.take(sessionA, convoA, idA)?.id).toBe(idA)
    expect(Pending.get(sessionA, convoA, idA)).toBeUndefined()

    Pending.clearConversation(sessionA, convoB)
    expect(Pending.get(sessionA, convoB, idB)).toBeUndefined()
  })
})
