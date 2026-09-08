import { NextResponse } from "next/server";

import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo-session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/access", request.url), 303);
  response.cookies.set(DEMO_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
