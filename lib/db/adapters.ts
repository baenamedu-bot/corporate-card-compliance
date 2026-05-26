/**
 * Supabase row → 기존 클라이언트 타입 어댑터.
 * 기존 로직(ruleBasedRisk, classifyMerchant, format 등)을 그대로 재사용하기 위함.
 */

import type {
  CardTransaction as DbTransaction,
  TransactionSettlement as DbSettlement,
  ComplianceFlag as DbFlag,
} from "@/lib/supabase/types";
import type {
  Transaction,
  Settlement,
  RiskAssessment,
  CardCompany,
  RiskLevel,
} from "@/lib/types";

const CARD_COMPANIES: CardCompany[] = [
  "신한", "삼성", "국민", "현대", "롯데", "BC", "NH농협", "하나", "기타",
];

function toCardCompany(issuer: string): CardCompany {
  return (CARD_COMPANIES as string[]).includes(issuer)
    ? (issuer as CardCompany)
    : "기타";
}

export function dbTxnToClient(t: DbTransaction, cardholderName?: string | null, department?: string | null): Transaction {
  return {
    id: t.id,
    paidAt: t.paid_at,
    merchantName: t.merchant,
    merchantCategory: t.merchant_category ?? undefined,
    merchantCode: t.mcc_code ?? undefined,
    amount: t.amount,
    cardLast4: t.card_last4,
    cardholderName: cardholderName ?? undefined,
    department: department ?? undefined,
    cardCompany: toCardCompany(t.card_issuer),
    uploadedAt: t.created_at,
    uploadBatchId: t.source_file ?? "",
  };
}

export function dbSettlementToClient(s: DbSettlement): Settlement {
  return {
    transactionId: s.transaction_id,
    attendees: s.attendees,
    purpose: s.purpose,
    hasPreApproval: s.has_pre_approval ?? undefined,
    approvalDocNumber: s.approval_doc_number ?? undefined,
    submittedAt: s.settled_at,
    submittedByLast4: "", // 호환용 — Supabase에서는 settled_by(uuid)가 진실
  };
}

export function dbFlagToRisk(f: DbFlag, amountTier: 0 | 1 | 2 | 3): RiskAssessment {
  return {
    transactionId: f.transaction_id,
    level: f.severity as RiskLevel,
    reasons: f.reasons ?? [],
    amountTier,
    assessedAt: f.created_at,
    aiAnalyzed: f.ai_analyzed,
    needsAI: f.needs_ai,
    classification: {
      verdict: (f.rule_type as "restricted" | "suspicious" | "ambiguous" | "clear") || "clear",
      category: f.category ?? undefined,
      matchedCode: f.matched_code ?? undefined,
      matchedKeyword: f.matched_keyword ?? undefined,
    },
  };
}
