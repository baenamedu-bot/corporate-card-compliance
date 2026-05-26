import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * 홈 = 라우터. 미들웨어 가드를 통과한 사용자(로그인+온보딩 완료)를
 * role 에 따라 기본 페이지로 보낸다.
 */
export default async function HomePage() {
  const sb = getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.rpc("get_my_profile");
  if (!profile || !profile.organization_id) redirect("/onboarding");

  if (profile.role === "employee") redirect("/my-card");
  redirect("/admin");
}
