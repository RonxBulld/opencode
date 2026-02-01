import { Identifier } from "../id/id"
import type { MessageV2 } from "../session/message-v2"
import type { Tool } from "./tool"
import { Scheduler } from "../scheduler"

export namespace Pending {
  export type Impact = "none" | "internal" | "external" | "unknown"

  export function conversationKey(messages: MessageV2.WithParts[]) {
    for (const msg of messages.toReversed()) {
      if (msg.info.role === "user") return msg.info.id
    }
  }

  // Tool results can include extra fields (e.g. MCP returns `content`).
  export type Result = {
    title: string
    metadata: unknown
    output: string
    attachments?: MessageV2.FilePart[]
    [key: string]: unknown
  }

  export type Run = (ctx: Tool.Context) => Promise<Result>

  export type Entry = {
    id: string
    tool: string
    impact: Impact
    created: number
    run: Run
  }

  // Fail-closed: keep entries short-lived; callers can re-stage on demand.
  const TTL_MS = 30 * 60 * 1000
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

  // sessionID -> conversationKey -> id -> entry
  const store = new Map<string, Map<string, Map<string, Entry>>>()

  function prune(entries: Map<string, Entry>, now: number) {
    for (const [id, entry] of entries) {
      if (now - entry.created > TTL_MS) entries.delete(id)
    }
  }

  export function init() {
    Scheduler.register({
      id: "tool.pending.cleanup",
      interval: CLEANUP_INTERVAL_MS,
      scope: "global",
      run: cleanup,
    })
  }

  export async function cleanup() {
    const now = Date.now()
    for (const [sessionID, s] of store) {
      for (const [key, c] of s) {
        prune(c, now)
        if (c.size === 0) s.delete(key)
      }
      if (s.size === 0) store.delete(sessionID)
    }
  }

  function session(sessionID: string) {
    const existing = store.get(sessionID)
    if (existing) return existing
    const created = new Map<string, Map<string, Entry>>()
    store.set(sessionID, created)
    return created
  }

  function conversation(s: Map<string, Map<string, Entry>>, key: string) {
    const existing = s.get(key)
    if (existing) return existing
    const created = new Map<string, Entry>()
    s.set(key, created)
    return created
  }

  export function put(input: { sessionID: string; conversationKey: string; tool: string; impact: Impact; run: Run }) {
    const now = Date.now()
    const id = Identifier.ascending("tool")
    const s = session(input.sessionID)
    const c = conversation(s, input.conversationKey)

    prune(c, now)
    const entry: Entry = {
      id,
      tool: input.tool,
      impact: input.impact,
      created: now,
      run: input.run,
    }
    c.set(id, entry)
    return id
  }

  export function get(sessionID: string, conversationKey: string, id: string) {
    const s = store.get(sessionID)
    const c = s?.get(conversationKey)
    if (!c) return
    prune(c, Date.now())
    return c.get(id)
  }

  // One-shot: delete before returning to prevent accidental re-use.
  export function take(sessionID: string, conversationKey: string, id: string) {
    const s = store.get(sessionID)
    const c = s?.get(conversationKey)
    if (!c) return
    prune(c, Date.now())
    const entry = c.get(id)
    if (!entry) return

    c.delete(id)
    if (c.size === 0) s?.delete(conversationKey)
    if (s?.size === 0) store.delete(sessionID)
    return entry
  }

  export function list(sessionID: string, conversationKey: string) {
    const s = store.get(sessionID)
    const c = s?.get(conversationKey)
    if (!c) return [] as Entry[]
    prune(c, Date.now())
    return Array.from(c.values())
  }

  export function clearConversation(sessionID: string, conversationKey: string) {
    const s = store.get(sessionID)
    if (!s) return
    s.delete(conversationKey)
    if (s.size === 0) store.delete(sessionID)
  }

  export function clearSession(sessionID: string) {
    store.delete(sessionID)
  }
}
