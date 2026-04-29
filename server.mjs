import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

loadEnvFile(path.join(__dirname, ".env"));

const defaultPort = Number(process.env.PORT) || 3000;
const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");
const MODEL = process.env.OLLAMA_MODEL || "llama3:latest";
const publicRoot = path.resolve(publicDir);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const source = readFileSync(filePath, "utf8");

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  const maxSize = 1_000_000;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxSize) {
      throw new Error("Request body is too large.");
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function getRequestedFile(pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(path.join(publicDir, relativePath));

  if (resolvedPath !== publicRoot && !resolvedPath.startsWith(`${publicRoot}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["hooks"],
    properties: {
      hooks: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["hook", "technique"],
          properties: {
            hook: {
              type: "string",
              description: "A LinkedIn hook written in one or two sentences.",
            },
            technique: {
              type: "string",
              enum: [
                "curiosity gap",
                "controversial take",
                "personal vulnerability",
                "storytelling",
                "contrast",
                "surprising insight"
              ],
              description: "A short label for the persuasion angle used.",
            },
          },
        },
      },
    },
  };
}

function validateStatement(statement) {
  if (typeof statement !== "string" || !statement.trim()) {
    throw new Error("Add a boring statement before generating hooks.");
  }

  if (statement.trim().length > 2000) {
    throw new Error("Keep the statement under 2,000 characters.");
  }

  return statement.trim();
}

function parseHookPayload(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("The model returned an empty response.");
  }

  const trimmed = rawText.trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fencedJson ? fencedJson[1].trim() : trimmed;

  let parsedOutput;

  try {
    parsedOutput = JSON.parse(jsonText);
  } catch {
    throw new Error("The model response could not be parsed.");
  }

  if (!Array.isArray(parsedOutput.hooks) || parsedOutput.hooks.length !== 5) {
    throw new Error("The model response did not include five hooks.");
  }

  const hooks = parsedOutput.hooks.map((item) => ({
    hook: String(item.hook || "").trim(),
    technique: String(item.technique || "").trim(),
  }));

  const hasInvalidHook = hooks.some((item) => !item.hook || !item.technique);

  if (hasInvalidHook) {
    throw new Error("The model returned an incomplete hook set.");
  }

  return hooks;
}

async function callOllama(endpoint, payload) {
  const apiResponse = await fetch(`${OLLAMA_HOST}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await apiResponse.json().catch(() => ({}));

  if (!apiResponse.ok) {
    throw new Error(data.error || "Ollama request failed.");
  }

  return data;
}

async function getOllamaStatus() {
  try {
    const apiResponse = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await apiResponse.json().catch(() => ({}));

    if (!apiResponse.ok) {
      throw new Error(data.error || "Ollama is not reachable.");
    }

    const installedModels = Array.isArray(data.models)
      ? data.models.map((item) => String(item.name || "").trim()).filter(Boolean)
      : [];

    return {
      ok: installedModels.includes(MODEL),
      reachable: true,
      configured: installedModels.includes(MODEL),
      host: OLLAMA_HOST,
      model: MODEL,
      installedModels,
    };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      configured: false,
      host: OLLAMA_HOST,
      model: MODEL,
      installedModels: [],
      error: error instanceof Error ? error.message : "Ollama is not reachable.",
    };
  }
}

async function generateHooks(statement) {
  const requestBody = {
    model: MODEL,
    stream: false,
    format: buildSchema(),
    messages: [
      {
        role: "system",
        content:
          "You are a viral social media strategist. Rewrite the user's boring statement into exactly five high-engagement LinkedIn hooks. Every hook must be one or two sentences. Use curiosity gaps, controversial takes, personal vulnerability, storytelling, contrast, or surprising insight when useful. Do not use hashtags or emojis unless they add extreme value. Keep each hook crisp, specific, and readable on LinkedIn. The technique field must be a short label chosen from the schema enum. Return only valid JSON that matches the schema.",
      },
      {
        role: "user",
        content: `Transform only the statement between the tags below.\n<statement>${statement}</statement>`,
      },
    ],
  };

  const data = await callOllama("/api/chat", requestBody);
  const rawOutput = data.message?.content;

  if (!rawOutput) {
    throw new Error("Ollama returned an empty response.");
  }

  return parseHookPayload(rawOutput);
}

async function handleGenerate(request, response) {
  try {
    const body = await readJsonBody(request);
    const statement = validateStatement(body.statement);
    const health = await getOllamaStatus();

    if (!health.reachable) {
      throw new Error(`Ollama is not reachable at ${OLLAMA_HOST}. Start Ollama first.`);
    }

    if (!health.configured) {
      throw new Error(`Model "${MODEL}" is not installed. Run: ollama pull ${MODEL}`);
    }

    const hooks = await generateHooks(statement);

    jsonResponse(response, 200, {
      hooks,
      model: MODEL,
    });
  } catch (error) {
    jsonResponse(response, 400, {
      error: error instanceof Error ? error.message : "Something went wrong.",
    });
  }
}

async function handleStaticRequest(pathname, response) {
  const requestedFile = getRequestedFile(pathname);

  if (!requestedFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const file = await fs.readFile(requestedFile);
    const extension = path.extname(requestedFile).toLowerCase();

    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    });
    response.end(file);
  } catch (error) {
    if (pathname !== "/" && !path.extname(pathname)) {
      await handleStaticRequest("/", response);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

export function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const health = await getOllamaStatus();
      jsonResponse(response, 200, health);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/generate-hooks") {
      await handleGenerate(request, response);
      return;
    }

    if (request.method === "GET") {
      await handleStaticRequest(url.pathname, response);
      return;
    }

    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  });
}

export async function startServer(port = defaultPort) {
  const server = createServer();

  await new Promise((resolve) => {
    server.listen(port, resolve);
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const server = await startServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : defaultPort;

  console.log(`LinkedIn Hooks Studio is running at http://localhost:${port}`);
}
