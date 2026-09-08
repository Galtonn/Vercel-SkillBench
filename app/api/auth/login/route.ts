import { NextResponse } from "next/server";

import {
  createDemoSession,
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_TTL_SECONDS,
  isDemoAccessConfigured,
  verifyAccessCode,
} from "@/lib/auth/demo-session";

export const dynamic = "force-dynamic";

function safeReturnTo(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export async function POST(request: Request) {
  if (!isDemoAccessConfigured()) {
    return NextResponse.json(
      { error: "The recruiter demo is not configured." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }

  const form = await request.formData();
  const code = form.get("code");
  const returnTo = safeReturnTo(form.get("returnTo"));

  if (
    typeof code !== "string" ||
    code.length > 128 ||
    !(await verifyAccessCode(code))
  ) {
    const destination = new URL("/access", request.url);
    destination.searchParams.set("error", "invalid");
    if (returnTo !== "/") destination.searchParams.set("next", returnTo);
    return NextResponse.redirect(destination, 303);
  }

  const { value } = await createDemoSession();
  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(DEMO_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DEMO_SESSION_TTL_SECONDS,
  });
  return response;
}
