import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That route isn&apos;t part of this SkillBench prototype.
      </p>
      <Link href="/" className={cn(buttonVariants(), "mt-6 inline-flex")}>
        Back to evaluations
      </Link>
    </div>
  );
}
