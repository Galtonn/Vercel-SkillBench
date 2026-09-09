import type { ModelToolDefinition } from "./provider";
import type { WorkspaceToolResult } from "./workspace";

const MAX_FETCH_BYTES = 128 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const ALLOWED_HOSTS = new Set(["raw.githubusercontent.com"]);

export const SAFE_FETCH_TOOL_NAME = "fetch_url";

export const SAFE_FETCH_TOOL: ModelToolDefinition = {
  name: SAFE_FETCH_TOOL_NAME,
  description:
    "Fetch a public text file from raw.githubusercontent.com. Use this for a skill's WebFetch step. Other hosts are blocked.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Allowed HTTPS URL to fetch." },
    },
    required: ["url"],
    additionalProperties: false,
  },
};

export async function safeFetchUrl(urlText: string): Promise<WorkspaceToolResult> {
  const detail = `fetch_url ${urlText}`;
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return { ok: false, detail, content: "Error: URL is not valid." };
  }

  if (
    url.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    return {
      ok: false,
      detail,
      content:
        "Error: only public HTTPS URLs on raw.githubusercontent.com are allowed.",
    };
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/plain" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        detail,
        content: `Error: remote server returned HTTP ${response.status}.`,
      };
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FETCH_BYTES) {
      return { ok: false, detail, content: "Error: remote file is too large." };
    }
    if (!response.body) {
      return { ok: false, detail, content: "Error: remote response had no body." };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let content = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_FETCH_BYTES) {
        await reader.cancel();
        return { ok: false, detail, content: "Error: remote file is too large." };
      }
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    return { ok: true, detail, content };
  } catch {
    return { ok: false, detail, content: "Error: remote file could not be fetched." };
  }
}
