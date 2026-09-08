import { NextResponse, type NextRequest } from "next/server";

import {
  DEMO_SESSION_COOKIE,
  isDemoAccessConfigured,
  verifyDemoSession,
} from "@/lib/auth/demo-session";

const PUBLIC_PATHS = new Set([
  "/access",
  "/api/auth/login",
  "/api/auth/logout",
]);

export async function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const configured = isDemoAccessConfigured();
  const session = configured
    ? await verifyDemoSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value)
    : null;

  if (session) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: configured
          ? "Your demo session has expired. Enter the access code again."
          : "The recruiter demo is not configured.",
      },
      { status: configured ? 401 : 503 },
    );
  }

  const destination = request.nextUrl.clone();
  destination.pathname = "/access";
  destination.search = "";
  destination.searchParams.set(
    configured ? "next" : "setup",
    configured ? `${request.nextUrl.pathname}${request.nextUrl.search}` : "1",
  );
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
