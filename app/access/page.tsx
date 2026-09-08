import { ArrowRight, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDemoAccessConfigured } from "@/lib/auth/demo-session";
import { currentDemoSession } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; setup?: string }>;
}) {
  const params = await searchParams;
  const configured = isDemoAccessConfigured();
  if (configured && (await currentDemoSession())) redirect("/");

  return (
    <div className="grid min-h-screen place-items-center bg-[#fafafa] px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="flex size-10 items-center justify-center rounded-lg bg-foreground text-background">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Private portfolio demo
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Explore SkillBench
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Enter the access code from the project owner to run live AI-agent
          evaluations. Each visitor gets an isolated workspace.
        </p>

        {configured ? (
          <form action="/api/auth/login" method="post" className="mt-8 space-y-4">
            <input
              type="hidden"
              name="returnTo"
              value={safeReturnTo(params.next)}
            />
            <label className="grid gap-2 text-sm font-medium">
              Access code
              <Input
                name="code"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                minLength={8}
                maxLength={128}
                aria-invalid={params.error === "invalid"}
              />
            </label>
            {params.error === "invalid" ? (
              <p role="alert" className="text-sm text-destructive">
                That access code is not valid.
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Enter demo
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <div className="mt-8 rounded-lg border border-border bg-muted p-4 text-sm leading-6">
            This deployment is waiting for <code>DEMO_ACCESS_CODE</code> and{" "}
            <code>DEMO_SESSION_SECRET</code> to be configured in Vercel.
          </div>
        )}

        <p className="mt-8 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
          Please do not submit confidential information. Skill content and task
          prompts are sent to the selected AI provider for evaluation.
        </p>
      </section>
    </div>
  );
}
