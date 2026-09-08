export const DEMO_SESSION_COOKIE = "skillbench_demo_session";
export const DEMO_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type DemoSession = {
  id: string;
  issuedAt: number;
  expiresAt: number;
};

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function sessionSecret(): string | null {
  return process.env.DEMO_SESSION_SECRET || null;
}

export function isDemoAccessConfigured(): boolean {
  return Boolean(process.env.DEMO_ACCESS_CODE && sessionSecret());
}

async function signingKey(): Promise<CryptoKey | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function verifyAccessCode(candidate: string): Promise<boolean> {
  const expected = process.env.DEMO_ACCESS_CODE;
  if (!expected || !candidate) return false;

  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function createDemoSession(): Promise<{
  session: DemoSession;
  value: string;
}> {
  const key = await signingKey();
  if (!key) throw new Error("Demo access is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const session: DemoSession = {
    id: crypto.randomUUID(),
    issuedAt: now,
    expiresAt: now + DEMO_SESSION_TTL_SECONDS,
  };
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return {
    session,
    value: `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`,
  };
}

export async function verifyDemoSession(
  value: string | null | undefined,
): Promise<DemoSession | null> {
  if (!value) return null;
  const key = await signingKey();
  if (!key) return null;

  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length > 0) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;

    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payload)),
    ) as Partial<DemoSession>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return parsed as DemoSession;
  } catch {
    return null;
  }
}

export function cookieValue(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === DEMO_SESSION_COOKIE) {
      return decodeURIComponent(value.join("="));
    }
  }
  return null;
}

export async function demoSessionFromRequest(
  request: Request,
  options: { mutation?: boolean } = {},
): Promise<DemoSession | null> {
  if (options.mutation) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      fetchSite === "cross-site"
    ) {
      return null;
    }
  }
  return verifyDemoSession(cookieValue(request));
}
