import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 미들웨어용 Supabase 클라이언트 + 세션 갱신.
 * - auth 쿠키를 회전(refresh)하고 가드 결과(response)를 반환
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // 환경변수 미설정 시 — 통과시키되 가드 동작 없음 (배포 직후 등)
    return { response, user: null, profile: null as null };
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // 세션 갱신
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인되어 있으면 본인 profile 조회 (RLS 우회 RPC)
  let profile: { organization_id: string | null; role: string | null } | null = null;
  if (user) {
    const { data } = await supabase.rpc("get_my_profile");
    if (data) {
      profile = {
        organization_id: data.organization_id ?? null,
        role: data.role ?? null,
      };
    }
  }

  return { response, user, profile };
}
