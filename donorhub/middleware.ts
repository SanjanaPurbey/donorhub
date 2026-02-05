import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple middleware that only handles redirects
// Auth checking is done in layouts using auth() from lib/auth
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect root to dashboard (auth will be checked in dashboard layout)
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
