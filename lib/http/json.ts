export const MAX_JSON_BODY_BYTES = 256 * 1024;

export class RequestBodyError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_JSON_BODY_BYTES) {
    throw new RequestBodyError("Request body is too large.", 413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BODY_BYTES) {
    throw new RequestBodyError("Request body is too large.", 413);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RequestBodyError("Request body must be JSON.");
  }
}
