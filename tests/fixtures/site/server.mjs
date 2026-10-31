import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(directory, "public");
const reportPath = path.resolve(directory, "../../../.tmp/e2e-report.json");
// Gi tHub  @   S  tarsail  sClover
const logPath = path.resolve(directory, "../../../.tmp/e2e.log");
const port = Number(process.env.PORT || 4174);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");

  if (url.pathname === "/__prprprwarp/log" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const message = Buffer.concat(chunks).toString("utf8");
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, `${new Date().toISOString()} ${message}\n`, {
      encoding: "utf8",
      flag: "a"
    });
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type"
    });
    response.end();
    return;
  }

  if (url.pathname === "/__prprprwarp/report" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const report = Buffer.concat(chunks).toString("utf8");
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, report, "utf8");
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type"
    });
    response.end();
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    });
    response.end();
    return;
  }

  if (url.pathname === "/api/profile") {
    response.writeHead(200, { "Content-Type": mimeTypes[".json"] });
    response.end(
      JSON.stringify({
        name: "Ada",
        role: "Warp tester",
        captured: true
      })
    );
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const target = path.resolve(publicDirectory, `.${pathname}`);
  if (!target.startsWith(`${publicDirectory}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
// Git   Hu b@Starsai   lsClover
    const targetStat = await stat(target);
    if (!targetStat.isFile()) throw new Error("not a file");
    const content = await readFile(target);
    response.writeHead(200, {
      "Content-Type":
        mimeTypes[path.extname(target)] || "application/octet-stream",
      "Content-Length": content.byteLength
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PrprprWarp fixture: http://127.0.0.1:${port}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
