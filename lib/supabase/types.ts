/**
 * Supabase 스키마 타입 (수기 정의).
 * 마이그레이션 0001~0004 과 동기화 유지.
 * supabase gen types 자동 생성을 추후 도입할 수 있음.
 */

export type UserRole = "super_admin" | "admin" | "compliance_officer" | "employee";
export type CardStatus = "active" | "suspended" | "expired";
export type SettlementStatus = "pending" | "submitted" | "approved" | "rejected";
export type FlagSeverity = "low" | "medium" | "high" | "critical";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  user_id: string;
  organization_id: string | null;
  role: UserRole;
  full_name: string | null;
  department: string | null;
  created_at: string;
}

export interface CorporateCard {
  id: string;
  organization_id: string;
  issuer: string;
  card_name: string | null;
  last4: string;
  assigned_to: string | null; // profiles.user_id
  status: CardStatus;
  created_at: string;
}

export interface CardTransaction {
  id: string;
  organization_id: string;
  card_id: string | null;
  card_last4: string;        // 매칭 폴백을 위해 원본 last4도 저장
  paid_at: string;
  merchant: string;
  merchant_category: string | null;
  mcc_code: string | null;
  amount: number;
  card_issuer: string;
  raw_data: Record<string, unknown> | null;
  source_file: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface TransactionSettlement {
  id: string;
  transaction_id: string;
  attendees: string;
  purpose: string;
  has_pre_approval: boolean | null;
  approval_doc_number: string | null;
  status: SettlementStatus;
  settled_by: string;
  settled_at: string;
}

export interface ComplianceFlag {
  id: string;
  transaction_id: string;
  severity: FlagSeverity;
  rule_type: string;        // 'ksic_restricted' | 'keyword_strong' | 'ambiguous' | 'amount_tier3' | 'late_night' | 'ai_review' 등
  category: string | null;  // 유흥주점/단란주점/...
  matched_code: string | null;
  matched_keyword: string | null;
  reasons: string[];
  ai_analyzed: boolean;
  needs_ai: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface Invite {
  code: string;             // 6자리
  organization_id: string;
  role: UserRole;           // employee | compliance_officer 만
  created_by: string;
  created_at: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
}

export interface WeeklyReport {
  id: string;
  organization_id: string;
  period_start: string;     // 월요일
  period_end: string;       // 그 다음 월요일 직전
  payload: Record<string, unknown>;
  generated_at: string;
}

export interface MonthlyReport {
  id: string;
  organization_id: string;
  period_start: string;     // 1일
  period_end: string;       // 다음달 1일 직전
  payload: Record<string, unknown>;
  generated_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  actor_user_id: string;
  action: string;           // 'card.create' | 'card.assign' | 'invite.create' | 'transactions.upload' 등
  target: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Supabase 클라이언트 제네릭에 필요한 형식 (최소 형태) */
export type Database = {
  public: {
    Tables: {
      organizations: { Row: Organization; Insert: Partial<Organization> & { name: string }; Update: Partial<Organization> };
      profiles: { Row: Profile; Insert: Partial<Profile> & { user_id: string }; Update: Partial<Profile> };
      corporate_cards: { Row: CorporateCard; Insert: Partial<CorporateCard> & { organization_id: string; issuer: string; last4: string }; Update: Partial<CorporateCard> };
      card_transactions: {
        Row: CardTransaction;
        Insert: Partial<CardTransaction> & {
          organization_id: string;
          card_last4: string;
          paid_at: string;
          merchant: string;
          amount: number;
          card_issuer: string;
          uploaded_by: string;
        };
        Update: Partial<CardTransaction>;
      };
      transaction_settlements: {
        Row: TransactionSettlement;
        Insert: Partial<TransactionSettlement> & {
          transaction_id: string;
          attendees: string;
          purpose: string;
          settled_by: string;
        };
        Update: Partial<TransactionSettlement>;
      };
      compliance_flags: {
        Row: ComplianceFlag;
        Insert: Partial<ComplianceFlag> & {
          transaction_id: string;
          severity: FlagSeverity;
          rule_type: string;
          reasons: string[];
        };
        Update: Partial<ComplianceFlag>;
      };
      invites: {
        Row: Invite;
        Insert: Partial<Invite> & {
          code: string;
          organization_id: string;
          role: UserRole;
          created_by: string;
          expires_at: string;
        };
        Update: Partial<Invite>;
      };
      weekly_reports: { Row: WeeklyReport; Insert: Partial<WeeklyReport> & { organization_id: string; period_start: string; period_end: string; payload: Record<string, unknown> }; Update: Partial<WeeklyReport> };
      monthly_reports: { Row: MonthlyReport; Insert: Partial<MonthlyReport> & { organization_id: string; period_start: string; period_end: string; payload: Record<string, unknown> }; Update: Partial<MonthlyReport> };
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog> & { organization_id: string; actor_user_id: string; action: string }; Update: Partial<AuditLog> };
    };
    // RPC 함수: supabase-js 의 엄격한 추론을 회피하기 위해 명시적 키 + 느슨한 Args.
    // 호출처는 결과를 명시적으로 좁힌다.
    Functions: {
      get_my_profile: { Args: Record<string, unknown>; Returns: unknown };
      claim_invite: { Args: Record<string, unknown>; Returns: unknown };
      create_organization_for_me: { Args: Record<string, unknown>; Returns: unknown };
      create_invite_code: { Args: Record<string, unknown>; Returns: unknown };
      upload_card_transactions: { Args: Record<string, unknown>; Returns: unknown };
      generate_weekly_report: { Args: Record<string, unknown>; Returns: unknown };
      generate_monthly_report: { Args: Record<string, unknown>; Returns: unknown };
    };
    Enums: {
      user_role: UserRole;
      card_status: CardStatus;
      settlement_status: SettlementStatus;
      flag_severity: FlagSeverity;
    };
  };
};
