/**
 * 컴플라이언스 제한 업종 사전 (한국표준산업분류 KSIC 10차 기반).
 *
 * 목적:
 *  - 룸살롱·단란주점·유흥주점·노래주점·접객 마사지업 등 법인카드 사용 시
 *    소명/제한 대상 업종을 결정적으로 판정한다.
 *  - 명확한 업종코드(KSIC) 또는 가맹점명 패턴으로 즉시 분류해
 *    Gemini 호출(토큰 비용)을 회피한다.
 *  - 모호한 케이스(예: "BAR"·"CLUB"·"마사지" — 와인바/골프클럽/스포츠마사지일 수 있음)
 *    만 AI 분류로 위임한다.
 *
 * 한국표준산업분류(KSIC) 10차 기준 출처: 통계청 KSIC.
 * 일부 코드는 카드사·VAN사가 부여하는 업종코드와 다를 수 있으므로
 * 가맹점명 패턴 매칭과 함께 사용한다.
 */

export type RestrictionCategory =
  | "유흥주점"     // 일반유흥(룸살롱·요정·접객원 동석)
  | "무도유흥"     // 무도(클럽·나이트)
  | "단란주점"     // 단란주점
  | "주점"         // 호프·생맥주 등 일반 주점 (회색지대)
  | "노래주점"     // 노래방 중 접객·주류 제공
  | "마사지/안마"  // 안마·마사지·스파 (회색지대)
  | "성인오락"     // 성인PC방·성인오락실
  | "기타접대";

export type ClassificationVerdict =
  | "restricted"   // 확정 제한 — 컴플라이언스 위반 가능성 매우 높음
  | "suspicious"   // 의심 — 컴플라이언스 검토 필요 (회색지대)
  | "ambiguous"    // 키워드는 매칭되지만 정상 업종일 수 있음 → AI 보완 필요
  | "clear";       // 명확히 정상 (일반 음식점·서비스업)

export interface ClassificationResult {
  verdict: ClassificationVerdict;
  category?: RestrictionCategory;
  matchedCode?: string;
  matchedCodeLabel?: string;
  matchedKeyword?: string;
  /** AI 추가 분류가 필요한지 (호출자가 이 플래그만 모아서 배치 분석) */
  needsAI: boolean;
  reasons: string[];
}

/* ---------- 1) KSIC 코드 사전 ---------- */

interface CodeEntry {
  category: RestrictionCategory;
  label: string;
  verdict: Exclude<ClassificationVerdict, "ambiguous">;
}

/**
 * 명확한 제한 업종 코드.
 * KSIC 10차 기준 5621x 계열(주점업)과 일부 개인서비스업.
 */
const RESTRICTED_KSIC: Record<string, CodeEntry> = {
  // 일반유흥 주점업 — 룸살롱·요정·접객원이 술 시중을 드는 영업
  "56211": { category: "유흥주점", label: "일반유흥 주점업", verdict: "restricted" },
  // 무도유흥 주점업 — 무도장 시설을 갖춘 주점 (클럽·나이트·디스코)
  "56212": { category: "무도유흥", label: "무도유흥 주점업", verdict: "restricted" },
  // 생맥주 전문점 — 회색지대 (일반 호프지만 접대 정황 발생)
  "56213": { category: "주점", label: "생맥주 전문점", verdict: "suspicious" },
  // 기타 주점업 — 와인바·이자카야·바 (회색지대)
  "56219": { category: "주점", label: "기타 주점업", verdict: "suspicious" },

  // 안마 시술업 (시각장애인 안마 제도 — 일반적으로는 합법 의료 서비스이나 회색지대)
  "96121": { category: "마사지/안마", label: "안마 시술업", verdict: "suspicious" },
  // 욕탕업
  "96112": { category: "마사지/안마", label: "욕탕업", verdict: "suspicious" },

  // 노래연습장 운영업 — 일반 노래방. 접대성 사용 시 회색지대
  "91221": { category: "노래주점", label: "노래연습장 운영업", verdict: "suspicious" },
};

/** 명확히 정상인 업종 코드 (KSIC 561x 음식점 계열 일부) */
const CLEAR_KSIC = new Set<string>([
  "56111", "56112", "56113", "56114", "56119", // 한식·중식·일식·서양식·기타 음식점
  "56121", "56122", "56129",                  // 외국식 음식점
  "56131",                                     // 기관 구내식당업
  "56141",                                     // 출장 음식 서비스업
  "56142",                                     // 이동 음식점업
  "56191",                                     // 제과점업
  "56192",                                     // 피자·햄버거·샌드위치 전문점
  "56193",                                     // 치킨 전문점
  "56194",                                     // 김밥·기타 간이 음식점업
  "56199",                                     // 그 외 기타 음식점업
  "56221", "56229",                            // 비알코올 음료점업 (카페 등)
]);

/* ---------- 2) 가맹점명 키워드 사전 ---------- */

interface PatternEntry {
  pattern: RegExp;
  category: RestrictionCategory;
  label: string;
}

/**
 * 명확한 제한 키워드. 매칭되면 즉시 restricted 확정 (AI 호출 X).
 *
 * 주의: 한국어 키워드는 `i` 플래그가 의미 없지만 일관성을 위해 부여.
 * 일부 영문 키워드(BAR·CLUB)는 모호 키워드로 분리됨 — STRONG_KEYWORDS 에 포함하지 않음.
 */
export const STRONG_KEYWORDS: PatternEntry[] = [
  // 일반 유흥주점
  { pattern: /룸살롱|텐프로|텐카페|풀살롱|쩜오/i, category: "유흥주점", label: "룸살롱 계열 키워드" },
  { pattern: /호스트바|호스트빠|호빠/i, category: "유흥주점", label: "호스트바 키워드" },
  { pattern: /퍼블릭(룸|바)?|단란퍼블릭/i, category: "유흥주점", label: "퍼블릭 키워드" },
  { pattern: /요정|기생|접대|VIP룸|풀살롱/i, category: "유흥주점", label: "접객형 주점 키워드" },

  // 단란주점 (한국식 분류)
  { pattern: /단란주점|단란\s?술집/i, category: "단란주점", label: "단란주점 키워드" },

  // 노래주점/유흥형 노래방
  { pattern: /노래방.*주점|주점.*노래|가요주점|노래빠|가라오케/i, category: "노래주점", label: "노래주점 키워드" },

  // 무도유흥 (명확한 나이트 계열)
  { pattern: /나이트클럽|나이트라이프|디스코텍|디스코장/i, category: "무도유흥", label: "나이트클럽 키워드" },

  // 캬바 — 일본식 유흥
  { pattern: /캬바(쿠라|레)?|캐바레|카바레/i, category: "유흥주점", label: "캬바쿠라/카바레 키워드" },

  // 성인 오락
  { pattern: /성인오락실|성인PC|성인전용|성인노래/i, category: "성인오락", label: "성인오락 키워드" },
];

/**
 * 모호한 키워드. 매칭되면 ambiguous → AI 추가 분류 필요.
 * (와인바·골프클럽·헬스클럽·치료 마사지 등 합법 업종과 구분 불가)
 */
export const AMBIGUOUS_KEYWORDS: Array<PatternEntry & { note: string }> = [
  {
    pattern: /(?<![가-힣A-Z])BAR(?![A-Z])|바\s*$|.+바$/i,
    category: "주점",
    label: "BAR/바 키워드",
    note: "와인바·골프바·웨딩바와 구분 필요",
  },
  {
    pattern: /(?<![가-힣A-Z])CLUB(?![A-Z])|클럽/i,
    category: "무도유흥",
    label: "CLUB/클럽 키워드",
    note: "골프클럽·헬스클럽·북클럽과 구분 필요",
  },
  {
    pattern: /라운지|LOUNGE/i,
    category: "유흥주점",
    label: "라운지 키워드",
    note: "호텔 라운지·비즈니스 라운지와 구분 필요",
  },
  {
    pattern: /마사지|안마|스파|MASSAGE|SPA/i,
    category: "마사지/안마",
    label: "마사지/안마 키워드",
    note: "치료/스포츠 마사지·호텔 스파와 구분 필요",
  },
  {
    pattern: /살롱|SALON/i,
    category: "유흥주점",
    label: "살롱 키워드",
    note: "미용실 살롱·티 살롱과 구분 필요",
  },
];

/**
 * 안전 힌트. 매칭되면 ambiguous 키워드 매칭이 있어도 clear 로 무시.
 * 모호 키워드의 오탐을 줄이는 화이트리스트.
 */
const SAFE_HINTS: RegExp[] = [
  /와인바|WINE\s?BAR/i,
  /칵테일바.*호텔|호텔.*바/i,
  /북카페|북바|북클럽|독서/i,
  /골프|GOLF|컨트리클럽|CC(?!\w)/i,
  /피트니스|헬스|FITNESS|GYM|크로스핏/i,
  /요가|필라테스|YOGA|PILATES/i,
  /병원|의원|클리닉|CLINIC|한의원|치과/i,
  /비즈니스\s?라운지|공항\s?라운지|호텔\s?라운지/i,
  /미용|뷰티|네일|헤어|BEAUTY|HAIR/i,
  /스포츠마사지|발마사지|족욕/i,
  /북클럽|독서모임|컬쳐클럽/i,
  /웨딩|컨벤션|컨퍼런스/i,
];

/* ---------- 분류 메인 ---------- */

function normalizeCode(code?: string): string | undefined {
  if (!code) return undefined;
  return code.toString().trim().replace(/[^0-9]/g, "");
}

/**
 * 가맹점명·업종코드 기반 분류.
 * AI 호출 없이 결정 가능한 경우 needsAI=false, 모호하면 needsAI=true.
 */
export function classifyMerchant(args: {
  merchantName: string;
  merchantCode?: string;
}): ClassificationResult {
  const name = (args.merchantName || "").trim();
  const reasons: string[] = [];

  /* 1) KSIC 코드 매칭 — 가장 강력한 시그널 */
  const code = normalizeCode(args.merchantCode);
  if (code) {
    if (RESTRICTED_KSIC[code]) {
      const e = RESTRICTED_KSIC[code];
      reasons.push(`KSIC ${code} (${e.label})`);
      return {
        verdict: e.verdict,
        category: e.category,
        matchedCode: code,
        matchedCodeLabel: e.label,
        needsAI: false,
        reasons,
      };
    }
    if (CLEAR_KSIC.has(code)) {
      reasons.push(`KSIC ${code} (일반 음식점·음료점 — 정상)`);
      return {
        verdict: "clear",
        matchedCode: code,
        needsAI: false,
        reasons,
      };
    }
  }

  /* 2) 명확한 제한 키워드 */
  for (const k of STRONG_KEYWORDS) {
    if (k.pattern.test(name)) {
      reasons.push(`가맹점명 키워드: ${k.label}`);
      return {
        verdict: "restricted",
        category: k.category,
        matchedKeyword: k.label,
        needsAI: false,
        reasons,
      };
    }
  }

  /* 3) 안전 힌트 — 모호 키워드보다 먼저 평가 (오탐 방지) */
  const safeHit = SAFE_HINTS.find((re) => re.test(name));

  /* 4) 모호 키워드 */
  for (const k of AMBIGUOUS_KEYWORDS) {
    if (k.pattern.test(name)) {
      if (safeHit) {
        reasons.push(
          `모호 키워드(${k.label}) 매칭됐지만 정상 업종 힌트(${safeHit.source.slice(0, 16)}...)로 정상 처리`,
        );
        return { verdict: "clear", needsAI: false, reasons };
      }
      reasons.push(`모호 키워드: ${k.label} (${k.note}) — AI 추가 분류 필요`);
      return {
        verdict: "ambiguous",
        category: k.category,
        matchedKeyword: k.label,
        needsAI: true,
        reasons,
      };
    }
  }

  /* 5) 정보 부족 (코드도 키워드도 매칭 없음) */
  if (!code) {
    // 업종코드도 없고 가맹점명도 모호 → 일반적으로 정상으로 보지만 AI 보조는 선택적
    return {
      verdict: "clear",
      needsAI: false,
      reasons: ["업종코드 없음 · 가맹점명에 제한 업종 키워드 없음"],
    };
  }

  // 알려지지 않은 코드 → 일단 clear, 필요 시 AI 호출
  return {
    verdict: "clear",
    needsAI: false,
    reasons: [`업종코드 ${code} 는 사전에 없음 — 일반 업종으로 추정`],
  };
}

/** UI 표시용 카테고리 한글 라벨 */
export function categoryLabel(c: RestrictionCategory): string {
  return c;
}

/** verdict 라벨/색 */
export function verdictLabel(v: ClassificationVerdict): string {
  return {
    restricted: "확정 제한",
    suspicious: "검토 필요",
    ambiguous: "AI 분류 필요",
    clear: "정상",
  }[v];
}
