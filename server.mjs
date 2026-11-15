import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  existsSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, example, analyze } from "./src/domain.mjs";
import { validateState, validDate, csv } from "./src/lib.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export function createApp({
  dataFile = resolve(root, "data/workspace.json"),
  memory = false,
} = {}) {
  const token = randomBytes(32).toString("hex");
  let lock;
  if (!memory) {
    mkdirSync(dirname(dataFile), { recursive: true });
    try {
      lock = openSync(dataFile + ".lock", "wx");
    } catch (error) {
      if (error.code !== "EEXIST")
        throw new Error(`Cannot open workspace ${dataFile}: ${error.message}`);
      throw new Error(
        `Workspace is locked: ${dataFile}. Stop the other instance. After a crash, remove the .lock file only when no instance is running.`,
      );
    }
  }
  let state;
  try {
    state = validateState(
      !memory && existsSync(dataFile)
        ? JSON.parse(readFileSync(dataFile, "utf8"))
        : example,
      config,
    );
  } catch (error) {
    if (lock !== undefined) {
      closeSync(lock);
      unlinkSync(dataFile + ".lock");
    }
    throw error;
  }
  let revision = randomUUID();
  const app = http.createServer(async (req, res) => {
    const host = req.headers.host;
    const expectedHost = `127.0.0.1:${app.address().port}`;
    const origin = `http://${expectedHost}`;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (host !== expectedHost)
      return send(403, {
        error: `Open ${origin}; localhost aliases are not accepted.`,
      });
    if (req.headers.origin && req.headers.origin !== origin)
      return send(403, { error: "Cross-origin requests are not allowed" });
    try {
      const url = new URL(req.url, origin);
      if (req.method === "GET" && url.pathname === "/api/workspace")
        return send(200, {
          ...state,
          revision,
          token,
          storage: memory ? "memory" : "file",
          config: { ...config, validate: undefined },
        });
      if (req.method === "GET" && url.pathname === "/api/report") {
        const asOf =
          url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
        if (!validDate(asOf))
          return send(400, { error: "Use a real YYYY-MM-DD date" });
        return send(200, analyze(state.records, state.settings, asOf));
      }
      if (req.method === "GET" && url.pathname === "/api/export") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${config.slug}.json"`,
        );
        return send(200, JSON.stringify(state, null, 2) + "\n");
      }
      if (req.method === "GET" && url.pathname === "/api/export.csv") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${config.slug}.csv"`,
        );
        return send(200, csv(state.records), "text/csv; charset=utf-8");
      }
      if (req.method === "PUT" && url.pathname === "/api/workspace") {
        if (req.headers["x-workspace-token"] !== token)
          return send(403, {
            error:
              "Workspace session changed or is invalid. Download your draft and reload before saving.",
          });
        if (
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
            req.headers["content-type"] ?? "",
          )
        )
          return send(415, { error: "Use application/json" });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024)
            return send(413, { error: "Maximum import size is 2 MB" });
          chunks.push(chunk);
        }
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          return send(400, { error: "Invalid JSON" });
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          return send(400, { error: "Workspace must be a JSON object" });
        if (body.revision !== revision)
          return send(409, {
            error:
              "Workspace changed in another tab. Download your draft before reloading, then review it against the latest workspace.",
          });
        let next;
        try {
          next = validateState(body, config);
        } catch (error) {
          return send(400, { error: error.message });
        }
        const serialized = JSON.stringify(next, null, 2) + "\n";
        if (Buffer.byteLength(serialized, "utf8") > 2 * 1024 * 1024)
          return send(413, {
            error:
              "Workspace exceeds the 2 MB backup limit. Reduce the number or size of records before saving.",
          });
        if (!memory) {
          const temporary = dataFile + ".tmp";
          writeFileSync(temporary, serialized, {
            mode: 0o600,
          });
          renameSync(temporary, dataFile);
        }
        state = next;
        revision = randomUUID();
        return send(200, { ...state, revision });
      }
      const files = {
        "/": ["public/index.html", "text/html"],
        "/app.js": ["public/app.js", "text/javascript"],
        "/style.css": ["public/style.css", "text/css"],
        "/favicon.svg": ["public/favicon.svg", "image/svg+xml"],
      };
      if (req.method === "GET" && files[url.pathname]) {
        const [path, type] = files[url.pathname];
        return send(
          200,
          readFileSync(join(root, path), "utf8"),
          type + "; charset=utf-8",
        );
      }
      send(404, { error: "Not found" });
    } catch (error) {
      console.error("Request failed:", error.message);
      send(500, {
        error: "Unable to process request. Check the server terminal.",
      });
    }
  });
  app.on("close", () => {
    if (lock !== undefined) {
      closeSync(lock);
      unlinkSync(dataFile + ".lock");
      lock = undefined;
    }
  });
  return app;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  let port = config.port,
    dataFile = resolve(root, "data/workspace.json"),
    memory = false;
  try {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--port" && /^\d+$/.test(args[i + 1] ?? ""))
        port = Number(args[++i]);
      else if (
        args[i] === "--data" &&
        args[i + 1] &&
        !args[i + 1].startsWith("--")
      )
        dataFile = resolve(args[++i]);
      else if (args[i] === "--memory") memory = true;
      else throw new Error(`Unknown or incomplete option: ${args[i]}`);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be between 1 and 65535");
    const app = createApp({ dataFile, memory });
    app.on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? `Port ${port} is busy. Use npm start -- --port ${port + 1}`
          : error.message,
      );
      app.close();
      process.exitCode = 1;
    });
    app.listen(port, "127.0.0.1", () =>
      console.log(
        `${config.title}\nOpen http://127.0.0.1:${port}\n${memory ? "Temporary sample workspace; changes disappear when stopped." : `Data: ${dataFile}`}\nPress Ctrl+C to stop.`,
      ),
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => app.close());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
