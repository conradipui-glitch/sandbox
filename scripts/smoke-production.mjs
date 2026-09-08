const baseUrl = String(process.env.SMOKE_BASE_URL || "").replace(/\/+$/, "");
if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(baseUrl)) {
  throw new Error("SMOKE_BASE_URL must be an https origin without a path");
}

const attempts = 8;
const delayMs = 2_000;
const requestTimeoutMs = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getWithRetry(path, validate) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      const result = await validate(response);
      console.log(`smoke ${path}: ok (attempt ${attempt})`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`smoke ${path}: attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`smoke ${path} failed`);
}

await getWithRetry("/api/health", async (response) => {
  const body = await response.json();
  if (body?.ok !== true || body?.service !== "living-history-sandbox") {
    throw new Error("health payload does not identify living-history-sandbox as healthy");
  }
  return body;
});

await getWithRetry("/api/scenarios", async (response) => {
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error("scenario payload is not an array");
  const ids = new Set(body.map((scenario) => scenario?.id));
  if (!ids.has("florence-workshop")) throw new Error("Florence scenario is missing after deploy");
  if (!ids.has("russia-1917")) throw new Error("legacy Russia scenario is missing after deploy");
  return body;
});

await getWithRetry("/", async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) throw new Error(`root content-type is ${contentType || "missing"}`);
  const html = await response.text();
  if (!html.includes('id="root"')) throw new Error("deployed client HTML is missing the React root");
  if (!html.includes("Переиграть историю")) throw new Error("deployed client HTML is not the expected application shell");
  return html;
});

console.log(`production smoke passed for ${baseUrl}`);
