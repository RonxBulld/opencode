import z from "zod"
import { Tool } from "./tool"
import { Pending } from "./pending"

const parameters = z.object({
  id: z.string().describe("Pending tool call id to execute"),
})

function withConfirmation(metadata: unknown, confirmation: Record<string, unknown>) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return {
      ...(metadata as Record<string, unknown>),
      confirmation,
    }
  }
  return { value: metadata, confirmation }
}

export const ConfirmTool = Tool.define("confirm", async () => {
  return {
    description: "Execute a previously staged tool call. Use this after a tool returns a staged response with an id.",
    parameters,
    async execute(params, ctx) {
      const key = Pending.conversationKey(ctx.messages)
      if (!key) throw new Error("confirm: no user message found")

      const entry = Pending.take(ctx.sessionID, key, params.id)
      if (!entry) throw new Error(`confirm: staged id not found or expired: ${params.id}`)

      const result = await entry.run(ctx)
      const title =
        result.title && result.title.length > 0 ? `Confirmed ${entry.tool}: ${result.title}` : `Confirmed ${entry.tool}`

      return {
        ...result,
        title,
        metadata: withConfirmation(result.metadata, {
          id: params.id,
          tool: entry.tool,
          impact: entry.impact,
          stagedAt: entry.created,
        }),
      }
    },
  }
})
