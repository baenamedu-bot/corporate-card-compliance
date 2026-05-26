import type { AmountTier, RiskLevel, Transaction, RiskAssessment, Settlement } from "./types";
import { isLateNight, isWeekend } from "./format";

export function amountTier(amount: number): AmountTier {
  if (amount >= 2_000_000) return 3;
  if (amount >= 1_000_000) return 2;
  if (amount >= 500_000) return 1;
  return 0;
}

export function tierLabel(t: AmountTier): string {
  return ["일반", "사후 보고", "사전 승인 필수", "최고 위험"][t];
}

export function tierDescription(t: AmountTier): string {
  return [
    "50만원 미만 — 일반 정산",
    "50만원 이상 100만원 미만 — 사후 보고 + 사전 승인서 존재 여부 확인",
    "100만원 이상 200만원 미만 — 사전 승인서 결재문서 번호 필수",
    "200만원 이상 — 컴플라이언스 자동 통보 + 최고 위험 등급",
  ][t];
}

/** 정산 입력 완전성 검사 (저장 가능 여부) */
export function validateSettlement(
  amount: number,
  attendees: string,
  purpose: string,
  hasPreApproval: boolean,
  approvalDocNumber: string,
): { ok: boolean; reason?: string } {
  if (!attendees.trim()) return { ok: false, reason: "참석자를 입력해주세요." };
  if (!purpose.trim()) return { ok: false, reason: "접대 목적을 입력해주세요." };

  const tier = amountTier(amount);
  if (tier === 1 && !hasPreApproval) {
    return {
      ok: false,
      reason: "50만원 이상 결제는 사전 승인서 존재 여부 확인이 필요합니다.",
    };
  }
  if (tier === 2 && !approvalDocNumber.trim()) {
    return {
      ok: false,
      reason: "100만원 이상 결제는 사전 승인서 결재문서 번호가 필수입니다.",
    };
  }
  if (tier === 3 && !approvalDocNumber.trim()) {
    return {
      ok: false,
      reason: "200만원 이상 결제는 결재문서 번호 입력 및 컴플라이언스 사전 통보가 필요합니다.",
    };
  }
  return { ok: true };
}

/* ---------- 휴리스틱 위험 탐지 ---------- */

const SUSPICIOUS_KEYWORDS = [
  "노래", "단란", "유흥", "주점", "바", "BAR", "Bar", "룸", "ROOM",
  "클럽", "CLUB", "라운지", "LOUNGE", "마사지", "안마", "스파",
  "텐프로", "가라오케", "캬바", "호스트", "퍼블릭", "단란주점",
];

/** 룰 베이스 위험 분석 (AI 호출 없이 즉시) */
export function ruleBasedRisk(txn: Transaction): RiskAssessment {
  const reasons: string[] = [];
  const tier = amountTier(txn.amount);

  const name = (txn.merchantName || "").toUpperCase();
  const hasSuspicious = SUSPICIOUS_KEYWORDS.some((k) =>
    name.includes(k.toUpperCase()),
  );
  if (hasSuspicious) reasons.push("가맹점명에 유흥업종 의심 키워드 포함");

  if (isLateNight(txn.paidAt)) reasons.push("심야(22시~05시) 시간대 결제");
  if (isWeekend(txn.paidAt)) reasons.push("주말 결제");

  if (tier === 3) reasons.push("200만원 이상 고액 결제 (최고 위험 등급)");
  else if (tier === 2) reasons.push("100만원 이상 사전 승인 필요");
  else if (tier === 1) reasons.push("50만원 이상 사후 보고 대상");

  let level: RiskLevel = "low";
  if (hasSuspicious || tier === 3) level = "critical";
  else if (tier === 2 || (isLateNight(txn.paidAt) && tier >= 1)) level = "high";
  else if (tier === 1 || isLateNight(txn.paidAt) || isWeekend(txn.paidAt))
    level = "medium";

  return {
    transactionId: txn.id,
    level,
    reasons,
    amountTier: tier,
    assessedAt: new Date().toISOString(),
    aiAnalyzed: false,
  };
}

export function riskLevelLabel(l: RiskLevel): string {
  return {
    low: "정상",
    medium: "주의",
    high: "경고",
    critical: "위험",
  }[l];
}

export function riskLevelClass(l: RiskLevel): string {
  return {
    low: "text-zinc-500 bg-zinc-100 border-zinc-200",
    medium: "text-amber-700 bg-amber-50 border-amber-200",
    high: "text-amber-800 bg-amber-100 border-amber-300",
    critical: "text-red-700 bg-red-50 border-red-200",
  }[l];
}

export function riskBarClass(l: RiskLevel): string {
  return {
    low: "risk-bar-low",
    medium: "risk-bar-medium",
    high: "risk-bar-high",
    critical: "risk-bar-critical",
  }[l];
}

export function isSettled(s?: Settlement | null): boolean {
  return !!s && !!s.attendees?.trim() && !!s.purpose?.trim();
}
