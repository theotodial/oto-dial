import { serialize, parse } from "cookie";
import { NextRequest, NextResponse } from "next/server";

const TOKEN_NAME = "auth-token";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function setTokenCookie(response: NextResponse, token: string) {
  const cookie = serialize(TOKEN_NAME, token, {
    maxAge: MAX_AGE,
    expires: new Date(Date.now() + MAX_AGE * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  response.headers.set("Set-Cookie", cookie);
  return response;
}

export function getTokenCookie(request: NextRequest): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = parse(cookieHeader);
  return cookies[TOKEN_NAME] || null;
}

export function removeTokenCookie(response: NextResponse) {
  const cookie = serialize(TOKEN_NAME, "", {
    maxAge: -1,
    path: "/",
  });

  response.headers.set("Set-Cookie", cookie);
  return response;
}

