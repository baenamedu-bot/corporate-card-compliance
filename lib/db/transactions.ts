"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type {
  CardTransaction,
  ComplianceFlag,
  TransactionSettlement,
} from "@/lib/supabase/types";

/**
 * 결제 일괄 업로드. 서버 RPC 로 last4 → card_id 매칭 + audit 로그 함께 처리.
 */
export async function uploadTransactions(rows: Array<{
  paid_at: string;
  merchant: string;
  merchant_category?: string | null;
  mcc_code?: string | null;
  amount: number;
  card_last4: string;
  card_issuer: string;
  raw_data?: Record<string, unknown> | null;
  source_file?: string | null;
}>): Promise<{ inserted: number; matched: number; unmatched: number }> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("upload_card_transactions", {
    payload: rows as unknown as never,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    inserted: row?.inserted ?? 0,
    matched: row?.matched ?? 0,
    unmatched: row?.unmatched ?? 0,
  };
}

/** 결제 조회 — RLS 가 본인/조직 범위 결정 */
export async function listTransactions(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<CardTransaction[]> {
  const sb = getSupabaseBrowser();
  let q = sb.from("card_transactions").select("*").order("paid_at", { ascending: false });
  if (opts?.from) q = q.gte("paid_at", opts.from);
  if (opts?.to) q = q.lt("paid_at", opts.to);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** 정산 일괄 조회 (transaction_id IN) */
export async function listSettlements(transactionIds?: string[]): Promise<TransactionSettlement[]> {
  const sb = getSupabaseBrowser();
  let q = sb.from("transaction_settlements").select("*");
  if (transactionIds && transactionIds.length) q = q.in("transaction_id", transactionIds);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function upsertSettlement(input: {
  transaction_id: string;
  attendees: string;
  purpose: string;
  has_pre_approval?: boolean | null;
  approval_doc_number?: string | null;
}): Promise<TransactionSettlement> {
  const sb = getSupabaseBrowser();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const { data, error } = await sb
    .from("transaction_settlements")
    .upsert(
      {
        transaction_id: input.transaction_id,
        attendees: input.attendees,
        purpose: input.purpose,
        has_pre_approval: input.has_pre_approval ?? null,
        approval_doc_number: input.approval_doc_number ?? null,
        settled_by: user.id,
        settled_at: new Date().toISOString(),
        status: "submitted",
      },
      { onConflict: "transaction_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** 플래그 조회·upsert */
export async function listFlags(transactionIds?: string[]): Promise<ComplianceFlag[]> {
  const sb = getSupabaseBrowser();
  let q = sb.from("compliance_flags").select("*");
  if (transactionIds && transactionIds.length) q = q.in("transaction_id", transactionIds);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function upsertFlag(input: {
  transaction_id: string;
  severity: ComplianceFlag["severity"];
  rule_type: string;
  category?: string | null;
  matched_code?: string | null;
  matched_keyword?: string | null;
  reasons: string[];
  ai_analyzed?: boolean;
  needs_ai?: boolean;
}): Promise<void> {
  const sb = getSupabaseBrowser();
  const { error } = await sb
    .from("compliance_flags")
    .upsert(
      {
        transaction_id: input.transaction_id,
        severity: input.severity,
        rule_type: input.rule_type,
        category: input.category ?? null,
        matched_code: input.matched_code ?? null,
        matched_keyword: input.matched_keyword ?? null,
        reasons: input.reasons,
        ai_analyzed: input.ai_analyzed ?? false,
        needs_ai: input.needs_ai ?? false,
      },
      { onConflict: "transaction_id" },
    );
  if (error) throw error;
}

export async function upsertFlagsBulk(items: Parameters<typeof upsertFlag>[0][]): Promise<void> {
  if (!items.length) return;
  const sb = getSupabaseBrowser();
  const { error } = await sb
    .from("compliance_flags")
    .upsert(
      items.map((i) => ({
        transaction_id: i.transaction_id,
        severity: i.severity,
        rule_type: i.rule_type,
        category: i.category ?? null,
        matched_code: i.matched_code ?? null,
        matched_keyword: i.matched_keyword ?? null,
        reasons: i.reasons,
        ai_analyzed: i.ai_analyzed ?? false,
        needs_ai: i.needs_ai ?? false,
      })),
      { onConflict: "transaction_id" },
    );
  if (error) throw error;
}

/** 현재 로그인 사용자에게 할당된 카드 목록 (employee 본인 카드 표시용) */
export async function listMyCards() {
  const sb = getSupabaseBrowser();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data, error } = await sb
    .from("corporate_cards")
    .select("*")
    .eq("assigned_to", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
