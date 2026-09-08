import { toProgressView } from "@/lib/adapters/ui";
import { loadEvaluation } from "@/lib/storage/evaluations";
import { demoSessionFromRequest } from "@/lib/auth/demo-session";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 400;
/** Stop streaming after this long; the client reconnects if it still needs to. */
const MAX_STREAM_MS = 4 * 60 * 1000;

/**
 * Server-sent events for a running evaluation.
 *
 * The runner persists progress as work completes, and this handler streams
 * changes from storage. Reading persisted state rather
 * than in-memory state means a page refresh, or a dev-server module reload,
 * recovers the true position instead of a stale guess.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/evaluations/[id]/events">,
) {
  const { id } = await context.params;
  const session = await demoSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let closed = false;
      let lastPayload = "";

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the platform.
        }
      };

      request.signal.addEventListener("abort", close);

      while (!closed) {
        if (request.signal.aborted) break;
        if (Date.now() - startedAt > MAX_STREAM_MS) {
          send("timeout", { message: "Progress stream timed out." });
          break;
        }

        let record;
        try {
          record = await loadEvaluation(id, session.id);
        } catch (error) {
          // Named "failed" rather than "error": on EventSource, a listener for
          // "error" also fires for transport errors, which would conflate a real
          // evaluation failure with a dropped connection.
          send("failed", {
            message: error instanceof Error ? error.message : "Unknown error.",
          });
          break;
        }

        if (!record) {
          send("failed", { message: "Evaluation not found." });
          break;
        }

        const progress = toProgressView(record);
        const payload = JSON.stringify(progress);
        if (payload !== lastPayload) {
          lastPayload = payload;
          send("progress", progress);
        }

        if (
          record.status === "completed" ||
          record.status === "failed" ||
          record.status === "cancelled"
        ) {
          send("done", { id: record.id, status: progress.status, error: record.error });
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
