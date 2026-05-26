export type CardCompany = "신한" | "삼성" | "국민" | "현대" | "롯데" | "BC" | "NH농협" | "하나" | "기타";

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** 금액 구간: 0=normal(50만 미만), 1=50~100만, 2=100~200만, 3=200만 이상 */
export type AmountTier = 0 | 1 | 2 | 3;

export interface Transaction {
  id: string;
  paidAt: string;              // ISO datetime
  merchantName: string;
  merchantCategory?: string;   // 업종명
  merchantCode?: string;       // 업종코드
  amount: number;              // 원
  cardLast4: string;           // 카드번호 끝 4자리
  cardholderName?: string;     // 소지자 (있을 때)
  department?: string;         // 부서 (있을 때)
  cardCompany: CardCompany;
  uploadedAt: string;
  uploadBatchId: string;
}

export interface Settlement {
  transactionId: string;
  attendees: string;            // 참석자
  purpose: string;              // 접대 목적
  hasPreApproval?: boolean;     // 50만~100만 사전 승인서 존재 여부
  approvalDocNumber?: string;   // 100만 이상 결재문서 번호
  submittedAt: string;
  submittedByLast4: string;
}

export interface RiskAssessment {
  transactionId: string;
  level: RiskLevel;
  reasons: string[];
  amountTier: AmountTier;
  assessedAt: string;
  aiAnalyzed: boolean;
  /** 컴플라이언스 룰 베이스 분류 결과 (룸살롱·단란주점 등) */
  classification?: {
    verdict: "restricted" | "suspicious" | "ambiguous" | "clear";
    category?: string;
    matchedCode?: string;
    matchedKeyword?: string;
  };
  /** 룰 베이스로 결론을 내지 못해 AI 추가 분류가 필요한지 */
  needsAI?: boolean;
}

export interface UploadBatch {
  id: string;
  uploadedAt: string;
  fileName: string;
  cardCompany: CardCompany;
  rowCount: number;
  periodStart?: string;
  periodEnd?: string;
}

/** AI 컬럼 매핑 결과 */
export interface ColumnMapping {
  paidAt: string;            // 원본 컬럼명
  merchantName: string;
  amount: string;
  cardLast4: string;
  merchantCategory?: string;
  merchantCode?: string;
  cardholderName?: string;
  department?: string;
  confidence: number;        // 0~1
  notes?: string;
}
