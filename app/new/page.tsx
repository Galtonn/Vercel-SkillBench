import { NewEvaluationForm } from "@/components/new-evaluation-form";
import { DEFAULT_AGENT_ID, getAgentOption } from "@/lib/eval/config";

export default async function NewEvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const requestedAgent = (await searchParams).agent;
  const initialAgentId =
    getAgentOption(Array.isArray(requestedAgent) ? requestedAgent[0] : requestedAgent)
      ?.id ?? DEFAULT_AGENT_ID;

  return (
    <div className="mx-auto max-w-[1200px] px-6">
      <NewEvaluationForm initialAgentId={initialAgentId} />
    </div>
  );
}
