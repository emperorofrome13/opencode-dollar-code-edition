import { createServer, request } from "node:http"
import { connect } from "node:net"
import path from "node:path"

const [directory, backend, port] = process.argv.slice(2)
const root = path.resolve(directory)
const target = new URL(backend)
const origin = `http://127.0.0.1:${port}`
const server = createServer(async (req, res) => {
  if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
    res.writeHead(403).end("Local launcher origin required")
    return
  }
  const url = new URL(req.url ?? "/", origin)
  if (url.pathname === "/__launcher/health") {
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ launcher: "opencodefork", pid: process.pid, backend }))
    return
  }
  const pathname = decodeURIComponent(url.pathname)
  const file = path.resolve(root, `.${pathname}`)
  const contained = file.startsWith(root + path.sep)
  const asset = contained && await Bun.file(file).exists()
  if ((req.method === "GET" || req.method === "HEAD") && (asset || req.headers.accept?.includes("text/html"))) {
    const content = Bun.file(asset ? file : path.join(root, "index.html"))
    res.setHeader("Content-Type", content.type)
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.end(req.method === "HEAD" ? undefined : Buffer.from(await content.arrayBuffer()))
    return
  }
  const upstream = request(new URL(req.url ?? "/", target), {
    method: req.method,
    headers: { ...req.headers, host: target.host },
  }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers)
    response.pipe(res)
  })
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502)
    res.end("Fork backend unavailable; run stop.bat, then quickstart.bat.")
  })
  res.on("close", () => upstream.destroy())
  req.pipe(upstream)
})
server.on("upgrade", (req, socket, head) => {
  if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
    socket.destroy()
    return
  }
  const upstream = connect(Number(target.port), target.hostname, () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`)
    for (const [name, value] of Object.entries({ ...req.headers, host: target.host })) {
      if (value !== undefined) upstream.write(`${name}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`)
    }
    upstream.write("\r\n")
    upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on("error", () => socket.destroy())
  socket.on("error", () => upstream.destroy())
  socket.on("close", () => upstream.destroy())
})
server.listen(Number(port), "127.0.0.1", () => console.log(`Local fork UI: ${origin}`))
