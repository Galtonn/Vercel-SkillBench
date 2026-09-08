import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  DEMO_SESSION_COOKIE,
  type DemoSession,
  verifyDemoSession,
} from "./demo-session";

export async function currentDemoSession(): Promise<DemoSession | null> {
  const value = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  return verifyDemoSession(value);
}

export async function requireDemoSession(): Promise<DemoSession> {
  const session = await currentDemoSession();
  if (!session) redirect("/access");
  return session;
}
