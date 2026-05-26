"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { CardStatus, CorporateCard } from "@/lib/supabase/types";

export interface NewCardInput {
  organization_id: string;
  issuer: string;
  card_name?: string | null;
  last4: string;
  assigned_to?: string | null;
  status?: CardStatus;
}

export async function listCards(): Promise<CorporateCard[]> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("corporate_cards")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCard(input: NewCardInput): Promise<CorporateCard> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("corporate_cards")
    .insert({
      organization_id: input.organization_id,
      issuer: input.issuer,
      card_name: input.card_name ?? null,
      last4: input.last4,
      assigned_to: input.assigned_to ?? null,
      status: input.status ?? "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<CorporateCard, "card_name" | "assigned_to" | "status">>,
): Promise<CorporateCard> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("corporate_cards")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCard(id: string): Promise<void> {
  const sb = getSupabaseBrowser();
  const { error } = await sb.from("corporate_cards").delete().eq("id", id);
  if (error) throw error;
}

/** 같은 조직의 직원 목록 (할당 드롭다운용) */
export async function listOrgMembers(): Promise<
  Array<{ user_id: string; full_name: string | null; department: string | null; role: string }>
> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("profiles")
    .select("user_id, full_name, department, role")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
