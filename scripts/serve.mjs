import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 5173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};
const apiRoutes = {
  "/api/coach": "../api/coach.js",
  "/api/telemetry": "../api/telemetry.js",
  "/api/auth/sign-in": "../api/auth/sign-in.js",
  "/api/auth/sign-up": "../api/auth/sign-up.js",
  "/api/auth/sign-out": "../api/auth/sign-out.js",
  "/api/auth/refresh": "../api/auth/refresh.js",
  "/api/auth/me": "../api/auth/me.js",
  "/api/auth/export": "../api/auth/export.js",
  "/api/auth/account": "../api/auth/account.js",
  "/api/jobs/presign": "../api/jobs/presign.js",
  "/api/jobs/analyze": "../api/jobs/analyze.js",
  "/api/jobs/cancel": "../api/jobs/cancel.js"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (apiRoutes[url.pathname]) {
    await serveApi(request, response, apiRoutes[url.pathname]);
    return;
  }

  const requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
  const filePath = resolve(root, requestedPath);
  if (!filePath.startsWith(`${root}${sep}`) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
});

async function serveApi(request, response, modulePath) {
  try {
    const body = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "") ? await readJson(request) : {};
    const { default: handler } = await import(modulePath);
    const adapter = {
      status(code) {
        response.statusCode = code;
        return this;
      },
      json(value) {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify(value));
        return this;
      },
      setHeader(name, value) {
        response.setHeader(name, value);
      },
      end(value) {
        response.end(value);
        return this;
      }
    };
    await handler({ method: request.method, body, headers: request.headers }, adapter);
  } catch {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Invalid JSON request body." }));
  }
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20_000) reject(new Error("Request body too large."));
    });
    request.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Personal Lang Coach running at http://127.0.0.1:${port}`);
});
