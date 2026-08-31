import { requestCancellation } from "@/lib/eval/runner";
import { loadEvaluation } from "@/lib/storage/evaluations";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/evaluations/[id]/cancel">,
) {
  const { id } = await context.params;

  const record = await loadEvaluation(id);
  if (!record) {
    return Response.json({ error: "Evaluation not found." }, { status: 404 });
  }
  if (record.status !== "running" && record.status !== "queued") {
    return Response.json(
      { error: "This evaluation is not running." },
      { status: 409 },
    );
  }

  const accepted = requestCancellation(id);
  if (!accepted) {
    return Response.json(
      {
        error:
          "This evaluation is not executing in this server process, so it cannot be cancelled here.",
      },
      { status: 409 },
    );
  }

  return Response.json({ ok: true });
}
