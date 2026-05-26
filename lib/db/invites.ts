"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Invite, UserRole } from "@/lib/supabase/types";

export async function listInvites(): Promise<Invite[]> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("invites")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createInviteCode(args: {
  role: Extract<UserRole, "employee" | "compliance_officer">;
  ttl_days?: number;
}): Promise<{ code: string; expires_at: string }> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("create_invite_code", {
    invite_role: args.role,
    ttl_days: args.ttl_days ?? 14,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.code) throw new Error("초대 코드 생성에 실패했습니다.");
  return { code: row.code, expires_at: row.expires_at };
}

export async function revokeInvite(code: string): Promise<void> {
  const sb = getSupabaseBrowser();
  const { error } = await sb.from("invites").delete().eq("code", code);
  if (error) throw error;
}
