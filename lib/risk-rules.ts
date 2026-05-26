import type { AmountTier, RiskLevel, Transaction, RiskAssessment, Settlement } from "./types";
import { isLateNight, isWeekend } from "./format";
import { classifyMerchant } from "./compliance/restricted-categories";

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

/* ---------- 룰 베이스 위험 탐지 ---------- */

/**
 * 룰 베이스 위험 분석 (AI 호출 없이 즉시).
 *  - 컴플라이언스 분류는 lib/compliance/restricted-categories 의 classifyMerchant() 사용
 *  - verdict 별 위험도 가산:
 *      restricted → critical 확정
 *      suspicious → 한 단계 격상
 *      ambiguous  → needsAI=true 로 표시, level 은 일단 medium 이상으로 보수적
 *      clear      → 가산 없음
 *  - 금액 구간/심야/주말 룰은 그대로 가산
 */
export function ruleBasedRisk(txn: Transaction): RiskAssessment {
  const reasons: string[] = [];
  const tier = amountTier(txn.amount);

  const classification = classifyMerchant({
    merchantName: txn.merchantName,
    merchantCode: txn.merchantCode,
  });

  // 분류 사유를 리스크 사유로 합침
  reasons.push(...classification.reasons);

  if (isLateNight(txn.paidAt)) reasons.push("심야(22시~05시) 시간대 결제");
  if (isWeekend(txn.paidAt)) reasons.push("주말 결제");

  if (tier === 3) reasons.push("200만원 이상 고액 결제 (최고 위험 등급)");
  else if (tier === 2) reasons.push("100만원 이상 사전 승인 필요");
  else if (tier === 1) reasons.push("50만원 이상 사후 보고 대상");

  // 베이스 레벨 산정
  let level: RiskLevel = "low";
  if (tier === 3) level = "critical";
  else if (tier === 2) level = "high";
  else if (tier === 1 || isLateNight(txn.paidAt) || isWeekend(txn.paidAt))
    level = "medium";

  // 컴플라이언스 분류 가산
  switch (classification.verdict) {
    case "restricted":
      level = "critical"; // 룸살롱·단란주점 등 명확 → 무조건 critical
      break;
    case "suspicious":
      level = severity(level) >= severity("high") ? level : "high";
      break;
    case "ambiguous":
      // 위험도는 보수적으로, AI 분류가 결정
      level = severity(level) >= severity("medium") ? level : "medium";
      break;
  }

  // 심야 + 1단계 이상 결제는 위험도 한 단계 추가 격상
  if (isLateNight(txn.paidAt) && tier >= 1 && level !== "critical") {
    level = severity(level) >= severity("high") ? level : "high";
  }

  return {
    transactionId: txn.id,
    level,
    reasons,
    amountTier: tier,
    assessedAt: new Date().toISOString(),
    aiAnalyzed: false,
    classification: {
      verdict: classification.verdict,
      category: classification.category,
      matchedCode: classification.matchedCode,
      matchedKeyword: classification.matchedKeyword,
    },
    needsAI: classification.needsAI,
  };
}

function severity(l: RiskLevel): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[l];
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
