/**
 * 카드사별 청구 엑셀 컬럼 매핑 프리셋.
 *
 * 동작 흐름:
 *  1) detectCardCompany() — 파일명·시트명·헤더 키워드로 카드사 추정
 *  2) applyPreset()       — 매칭된 프리셋의 후보 컬럼명으로 표준 매핑 생성
 *  3) 필수 4개 필드(paidAt/merchantName/amount/cardLast4) 모두 매핑되면 성공
 *  4) 실패 시 호출자가 Gemini AI 폴백을 사용
 */

import type { CardCompany, ColumnMapping } from "./types";

/** 표준 필드별 후보 컬럼명. 같은 필드에 대해 여러 카드사 변형을 함께 둠 */
interface PresetSpec {
  paidAt: string[];
  merchantName: string[];
  amount: string[];
  cardLast4: string[];
  merchantCategory?: string[];
  merchantCode?: string[];
  cardholderName?: string[];
  department?: string[];
  /** 카드사 감지 키워드 (파일명/시트명) */
  fileHints: string[];
  /** 헤더에 있으면 강한 시그널 */
  headerSignatures: string[];
}

/**
 * 한국 8대 카드사 청구서 컬럼명 프리셋.
 * 카드사별 양식이 시기에 따라 변형되므로 가장 흔한 후보를 폭넓게 등록.
 */
export const CARD_PRESETS: Record<Exclude<CardCompany, "NH농협" | "기타">, PresetSpec> = {
  신한: {
    paidAt: ["승인일자", "승인일시", "이용일자", "이용일시", "거래일자", "결제일자", "결제일시"],
    merchantName: ["가맹점명", "이용가맹점", "가맹점", "사용처"],
    amount: ["승인금액", "이용금액", "청구금액", "결제금액", "매출금액"],
    cardLast4: ["카드번호", "카드번호(끝4자리)", "카드끝번호", "카드 끝번호", "이용카드"],
    merchantCategory: ["업종", "업종명", "가맹점업종", "업태"],
    merchantCode: ["업종코드", "표준산업분류코드"],
    cardholderName: ["사용자명", "회원명", "카드사용자", "회원성명"],
    department: ["부서", "소속", "소속부서"],
    fileHints: ["신한", "shinhan", "shinhancard", "SHC"],
    headerSignatures: ["승인일자", "승인금액"],
  },

  삼성: {
    paidAt: ["이용일자", "이용일시", "사용일자", "매입일자", "승인일자", "결제일자"],
    merchantName: ["가맹점명", "가맹점", "이용가맹점", "사용처"],
    amount: ["이용금액", "청구금액", "이용금액(원)", "매출금액", "결제금액"],
    cardLast4: ["카드번호", "이용카드번호", "카드끝번호"],
    merchantCategory: ["가맹점업종", "업종", "업종명", "업태"],
    merchantCode: ["업종코드"],
    cardholderName: ["회원명", "회원성명", "사용자명"],
    department: ["부서", "소속"],
    fileHints: ["삼성", "samsung", "samsungcard", "SSCD"],
    headerSignatures: ["이용일자", "이용금액"],
  },

  국민: {
    paidAt: ["이용일", "이용일자", "이용일시", "승인일자", "거래일자"],
    merchantName: ["가맹점명", "이용가맹점명", "가맹점", "이용가맹점"],
    amount: ["이용금액", "청구금액", "원화금액", "이용금액(원)"],
    cardLast4: ["카드번호", "카드번호(뒷4자리)", "카드끝번호"],
    merchantCategory: ["업종구분", "업종", "가맹점업종", "업종명"],
    merchantCode: ["업종코드", "MCC"],
    cardholderName: ["회원명", "사용자명", "회원성명"],
    department: ["소속", "부서"],
    fileHints: ["국민", "KB", "kbcard", "kb국민", "kookmin"],
    headerSignatures: ["이용일", "이용금액"],
  },

  현대: {
    paidAt: ["거래일자", "거래일시", "이용일자", "이용일시", "승인일자"],
    merchantName: ["가맹점", "가맹점명", "이용가맹점"],
    amount: ["거래금액", "이용금액", "청구금액", "결제금액", "매출금액"],
    cardLast4: ["카드번호", "카드끝번호", "이용카드"],
    merchantCategory: ["업종", "업종명", "가맹점업종", "업태"],
    merchantCode: ["업종코드", "MCC"],
    cardholderName: ["회원명", "회원성명", "사용자명"],
    department: ["부서", "소속"],
    fileHints: ["현대", "hyundai", "hyundaicard", "HCS"],
    headerSignatures: ["거래일자", "거래금액"],
  },

  롯데: {
    paidAt: ["이용일자", "이용일시", "거래일자", "승인일자"],
    merchantName: ["가맹점명", "가맹점", "이용가맹점"],
    amount: ["매출금액", "이용금액", "청구금액", "결제금액"],
    cardLast4: ["카드번호", "카드끝번호"],
    merchantCategory: ["업종명", "업종", "업태", "가맹점업종"],
    merchantCode: ["업종코드"],
    cardholderName: ["회원명", "사용자명"],
    department: ["부서", "소속"],
    fileHints: ["롯데", "lotte", "lottecard"],
    headerSignatures: ["이용일자", "매출금액"],
  },

  BC: {
    paidAt: ["매출일자", "매출일", "이용일자", "거래일자", "승인일자"],
    merchantName: ["가맹점명", "가맹점", "이용가맹점"],
    amount: ["매출금액", "이용금액", "청구금액"],
    cardLast4: ["카드번호", "카드끝번호"],
    merchantCategory: ["업종", "업종명", "가맹점업종"],
    merchantCode: ["업종코드", "표준산업코드"],
    cardholderName: ["회원명", "사용자명"],
    department: ["부서", "소속"],
    fileHints: ["BC", "비씨", "bccard", "bc카드"],
    headerSignatures: ["매출일자", "매출금액"],
  },

  하나: {
    paidAt: ["거래일자", "거래일", "거래일시", "이용일자", "승인일자"],
    merchantName: ["가맹점명", "가맹점", "이용가맹점"],
    amount: ["거래금액", "이용금액", "청구금액", "결제금액"],
    cardLast4: ["카드번호", "카드끝번호"],
    merchantCategory: ["업종", "업종명", "가맹점업종"],
    merchantCode: ["업종코드"],
    cardholderName: ["회원명", "사용자명"],
    department: ["부서", "소속"],
    fileHints: ["하나", "hana", "hanacard", "외환"],
    headerSignatures: ["거래일자", "거래금액"],
  },

  // 우리카드는 CardCompany 타입에 없어 별도 처리. 아래 OPTIONAL_PRESETS 로 확장.
} as Record<Exclude<CardCompany, "NH농협" | "기타">, PresetSpec>;

/**
 * CardCompany 타입에 정의되지 않은 카드사용 확장 프리셋.
 * detect 결과로 반환되며, 호출자가 적절한 CardCompany 로 매핑한다.
 */
export const OPTIONAL_PRESETS: Record<string, PresetSpec> = {
  우리: {
    paidAt: ["사용일자", "이용일자", "거래일자", "승인일자"],
    merchantName: ["가맹점명", "가맹점", "이용가맹점"],
    amount: ["사용금액", "이용금액", "청구금액", "결제금액"],
    cardLast4: ["카드번호", "카드끝번호"],
    merchantCategory: ["업종", "업종명", "가맹점업종"],
    merchantCode: ["업종코드"],
    cardholderName: ["회원명", "사용자명"],
    department: ["부서", "소속"],
    fileHints: ["우리", "woori", "wooricard"],
    headerSignatures: ["사용일자", "사용금액"],
  },
};

export interface DetectionResult {
  company: CardCompany;
  /** 0~1, 매칭 강도 */
  confidence: number;
  source: "filename" | "sheet" | "header";
}

/** 헤더 비교용: 공백·괄호·특수문자 제거 후 소문자로 */
function norm(s: string): string {
  return s.toString().toLowerCase().replace(/[\s()（）\[\]_\-./]/g, "");
}

function includesAny(target: string, hints: string[]): string | null {
  const t = norm(target);
  for (const h of hints) {
    if (t.includes(norm(h))) return h;
  }
  return null;
}

/**
 * 파일명 → 시트명 → 헤더 키워드 순으로 카드사를 추정한다.
 * 매칭이 없으면 null.
 */
export function detectCardCompany(args: {
  fileName?: string;
  sheetName?: string;
  headers: string[];
}): DetectionResult | null {
  const { fileName = "", sheetName = "", headers } = args;
  const presets: Array<[string, PresetSpec]> = [
    ...Object.entries(CARD_PRESETS),
    ...Object.entries(OPTIONAL_PRESETS),
  ];

  // 1) 파일명 매칭 (강한 시그널)
  for (const [name, p] of presets) {
    if (includesAny(fileName, p.fileHints)) {
      return { company: name as CardCompany, confidence: 0.95, source: "filename" };
    }
  }

  // 2) 시트명 매칭
  for (const [name, p] of presets) {
    if (includesAny(sheetName, p.fileHints)) {
      return { company: name as CardCompany, confidence: 0.9, source: "sheet" };
    }
  }

  // 3) 헤더 시그니처 점수제: 해당 카드사 시그너처가 헤더에 가장 많이 포함된 곳
  const normHeaders = headers.map((h) => norm(h));
  let best: { name: string; score: number } | null = null;
  for (const [name, p] of presets) {
    const score = p.headerSignatures.reduce(
      (acc, sig) => acc + (normHeaders.some((h) => h.includes(norm(sig))) ? 1 : 0),
      0,
    );
    if (score > 0 && (!best || score > best.score)) {
      best = { name, score };
    }
  }
  if (best && best.score >= 2) {
    return { company: best.name as CardCompany, confidence: 0.8, source: "header" };
  }
  if (best && best.score === 1) {
    return { company: best.name as CardCompany, confidence: 0.6, source: "header" };
  }

  return null;
}

function pickHeader(headers: string[], candidates: string[]): string | undefined {
  const normMap = new Map(headers.map((h) => [norm(h), h]));
  for (const c of candidates) {
    const hit = normMap.get(norm(c));
    if (hit) return hit;
  }
  // 부분 매칭 폴백
  for (const c of candidates) {
    const cn = norm(c);
    for (const [nh, original] of normMap.entries()) {
      if (nh.includes(cn) || cn.includes(nh)) return original;
    }
  }
  return undefined;
}

/**
 * 프리셋을 헤더에 적용해 표준 매핑 생성.
 * 필수 4개 필드(paidAt/merchantName/amount/cardLast4) 모두 매핑되어야 성공.
 * 실패 시 null → 호출자가 AI 폴백.
 */
export function applyPreset(
  company: CardCompany,
  headers: string[],
): ColumnMapping | null {
  const preset =
    (CARD_PRESETS as Record<string, PresetSpec>)[company] ??
    OPTIONAL_PRESETS[company];
  if (!preset) return null;

  const paidAt = pickHeader(headers, preset.paidAt);
  const merchantName = pickHeader(headers, preset.merchantName);
  const amount = pickHeader(headers, preset.amount);
  const cardLast4 = pickHeader(headers, preset.cardLast4);

  if (!paidAt || !merchantName || !amount || !cardLast4) return null;

  return {
    paidAt,
    merchantName,
    amount,
    cardLast4,
    merchantCategory: preset.merchantCategory ? pickHeader(headers, preset.merchantCategory) : undefined,
    merchantCode: preset.merchantCode ? pickHeader(headers, preset.merchantCode) : undefined,
    cardholderName: preset.cardholderName ? pickHeader(headers, preset.cardholderName) : undefined,
    department: preset.department ? pickHeader(headers, preset.department) : undefined,
    confidence: 1.0,
    notes: `${company}카드 프리셋으로 즉시 매핑 (AI 호출 없음)`,
  };
}

/** 우리카드 등 CardCompany 타입에 없는 카드사 → "기타"로 강제 매핑 */
export function normalizeDetectedCompany(c: CardCompany | string): CardCompany {
  const allowed: CardCompany[] = ["신한", "삼성", "국민", "현대", "롯데", "BC", "NH농협", "하나", "기타"];
  if ((allowed as string[]).includes(c)) return c as CardCompany;
  return "기타";
}
