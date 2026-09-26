// Minimal OpenAI-compatible mock LLM used by the token A/B harness.
//
// Captures every chat/completions (or responses) request body to MOCK_CAPTURE
// as JSONL, then replies with a trivial streamed assistant message so opencode
// completes the turn. When MOCK_TOOL is set to JSON {name,args}, the first
// non-title turn returns a tool call instead, so a second request carrying the
// tool result is captured too (this is how tool-output truncation is measured).
//
// MOCK_TOOL_TURNS makes the mock keep asking for the same tool for that many
// turns before it stops, so a whole multi-turn session (and its cumulative
// context growth) can be captured, not just a single tool result.
//
// Env: MOCK_PORT, MOCK_CAPTURE, MOCK_TOOL, MOCK_TOOL_TURNS
const port = Number(process.env.MOCK_PORT ?? "4631")
const capture = process.env.MOCK_CAPTURE ?? "capture.jsonl"
const tool = process.env.MOCK_TOOL ? JSON.parse(process.env.MOCK_TOOL) : null
const toolTurns = Number(process.env.MOCK_TOOL_TURNS ?? "1")

function line(part: Record<string, unknown>) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    choices: [{ delta: part.delta ?? {}, ...(part.finish ? { finish_reason: part.finish } : {}) }],
    ...(part.usage ? { usage: part.usage } : {}),
  })}\n\n`
}

function sse(parts: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const p of parts) controller.enqueue(enc.encode(p))
      controller.close()
    },
  })
  return new Response(body, { headers: { "content-type": "text/event-stream" } })
}

function textReply() {
  return sse([
    line({ delta: { role: "assistant" } }),
    line({ delta: { content: "ok" } }),
    line({ delta: {}, finish: "stop", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    "data: [DONE]\n\n",
  ])
}

function toolReply(id: string) {
  const args = JSON.stringify(tool.args ?? {})
  return sse([
    line({ delta: { role: "assistant" } }),
    line({
      delta: {
        tool_calls: [{ index: 0, id, type: "function", function: { name: tool.name, arguments: "" } }],
      },
    }),
    line({ delta: { tool_calls: [{ index: 0, function: { arguments: args } }] } }),
    line({ delta: {}, finish: "tool_calls", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    "data: [DONE]\n\n",
  ])
}

await Bun.write(capture, "")

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/v1/models") {
      return Response.json({ object: "list", data: [{ id: "test-model", object: "model" }] })
    }
    if (url.pathname === "/v1/chat/completions" || url.pathname === "/v1/responses") {
      const text = await req.text()
      await Bun.write(
        capture,
        (await Bun.file(capture).text()) + JSON.stringify({ path: url.pathname, body: text }) + "\n",
      )
      const body = JSON.parse(text)
      const isTitle = text.includes("Generate a title for this conversation")
      const toolResults = (body.messages ?? []).filter((m: { role?: string }) => m.role === "tool").length
      if (tool && !isTitle && toolResults < toolTurns) return toolReply(`call_${toolResults + 1}`)
      return textReply()
    }
    return new Response("not found", { status: 404 })
  },
})

console.log(`READY http://127.0.0.1:${port}/v1`)
