import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessCodes, isValidToken } from "./lib/access";

// Every run of the tool costs API money, so the tool and its API need an access code (see lib/access.ts).
// The landing page, the access page and the shared report pages stay public.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (accessCodes().length === 0) return NextResponse.next();
  if (pathname === "/api/access") return NextResponse.next();
  if (await isValidToken(request.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Access code required. Reload the page and enter your access code." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/access";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app", "/app/:path*", "/api/:path*"] };
