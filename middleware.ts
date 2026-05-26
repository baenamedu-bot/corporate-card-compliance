import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/signup",
  "/auth/callback",
]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 환경변수 미설정 시(빌드 직후 등) — 통과만
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();

  if (isPublic(pathname)) {
    // 로그인+온보딩 완료된 사용자가 login/signup 접근 시 홈으로 보냄
    const { response, user, profile } = await updateSession(request);
    if (user && profile?.organization_id && (pathname === "/login" || pathname === "/signup")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return response;
  }

  const { response, user, profile } = await updateSession(request);

  // 비로그인 → /login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 온보딩 미완료 (조직 없음) → /onboarding
  if (!profile?.organization_id && pathname !== "/onboarding") {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  // 온보딩 완료한 사용자가 /onboarding 들어오면 홈으로
  if (profile?.organization_id && pathname === "/onboarding") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // 영업 직원이 admin 페이지 접근 → /my-card 로
  if (
    pathname.startsWith("/admin") &&
    profile?.role !== "admin" &&
    profile?.role !== "compliance_officer" &&
    profile?.role !== "super_admin"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/my-card";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 자원 제외, 페이지만 매칭
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
