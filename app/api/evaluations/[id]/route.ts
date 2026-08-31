import { toDetail, toProgressView } from "@/lib/adapters/ui";
import { loadEvaluation } from "@/lib/storage/evaluations";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/evaluations/[id]">,
) {
  const { id } = await context.params;

  let record;
  try {
    record = await loadEvaluation(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!record) {
    return Response.json({ error: "Evaluation not found." }, { status: 404 });
  }

  return Response.json({
    progress: toProgressView(record),
    detail: record.metrics ? toDetail(record) : null,
  });
}
