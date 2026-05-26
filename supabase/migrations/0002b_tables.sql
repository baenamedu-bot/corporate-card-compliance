-- =============================================================================
-- 0002b_tables.sql — 도메인 테이블 (enum 사용)
-- 0002a 이후 실행. 카드·결제·정산·플래그·초대·보고서·감사 로그.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- corporate_cards : 회사 보유 법인카드 마스터
-- ----------------------------------------------------------------------------
create table if not exists public.corporate_cards (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  issuer           text not null,
  card_name        text,
  last4            text not null check (last4 ~ '^[0-9]{4}$'),
  assigned_to      uuid references public.profiles(user_id) on delete set null,
  status           public.card_status not null default 'active',
  created_at       timestamptz not null default now(),
  unique (organization_id, issuer, last4)
);

create index if not exists idx_cards_org on public.corporate_cards(organization_id);
create index if not exists idx_cards_assigned on public.corporate_cards(assigned_to);
create index if not exists idx_cards_last4 on public.corporate_cards(organization_id, last4);

-- ----------------------------------------------------------------------------
-- card_transactions : 결제 내역
-- card_id 는 last4 매칭이 성공할 때만 채워짐 (매칭 실패해도 결제 자체는 저장)
-- ----------------------------------------------------------------------------
create table if not exists public.card_transactions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  card_id            uuid references public.corporate_cards(id) on delete set null,
  card_last4         text not null check (card_last4 ~ '^[0-9]{4}$'),
  card_issuer        text not null,
  paid_at            timestamptz not null,
  merchant           text not null,
  merchant_category  text,
  mcc_code           text,
  amount             bigint not null check (amount >= 0),  -- 원 단위 정수
  raw_data           jsonb,
  source_file        text,
  uploaded_by        uuid not null references public.profiles(user_id),
  created_at         timestamptz not null default now()
);

create index if not exists idx_txn_org_paid on public.card_transactions(organization_id, paid_at desc);
create index if not exists idx_txn_card on public.card_transactions(card_id);
create index if not exists idx_txn_uploader on public.card_transactions(uploaded_by);
create index if not exists idx_txn_org_last4 on public.card_transactions(organization_id, card_last4);

-- ----------------------------------------------------------------------------
-- transaction_settlements : 정산 입력 (참석자/목적/승인문서)
-- 100만원 이상은 approval_doc_number 필수 — application 레벨에서 검증 + DB 함수에서 가드
-- transaction 당 1개 (1:1)
-- ----------------------------------------------------------------------------
create table if not exists public.transaction_settlements (
  id                    uuid primary key default gen_random_uuid(),
  transaction_id        uuid not null unique references public.card_transactions(id) on delete cascade,
  attendees             text not null check (char_length(attendees) > 0),
  purpose               text not null check (char_length(purpose) > 0),
  has_pre_approval      boolean,
  approval_doc_number   text,
  status                public.settlement_status not null default 'submitted',
  settled_by            uuid not null references public.profiles(user_id),
  settled_at            timestamptz not null default now()
);

create index if not exists idx_settle_txn on public.transaction_settlements(transaction_id);

-- ----------------------------------------------------------------------------
-- compliance_flags : 위험 평가 결과 (룰 베이스 + AI 보강)
-- ----------------------------------------------------------------------------
create table if not exists public.compliance_flags (
  id                uuid primary key default gen_random_uuid(),
  transaction_id    uuid not null unique references public.card_transactions(id) on delete cascade,
  severity          public.flag_severity not null,
  rule_type         text not null,
  category          text,
  matched_code      text,
  matched_keyword   text,
  reasons           text[] not null default '{}',
  ai_analyzed       boolean not null default false,
  needs_ai          boolean not null default false,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

create index if not exists idx_flag_txn on public.compliance_flags(transaction_id);
create index if not exists idx_flag_severity on public.compliance_flags(severity) where resolved_at is null;

-- ----------------------------------------------------------------------------
-- invites : 6자리 초대 코드 (외부 이메일 발송 X — 화면 표시 + 복사)
-- ----------------------------------------------------------------------------
create table if not exists public.invites (
  code             text primary key check (code ~ '^[A-Z0-9]{6}$'),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             public.user_role not null check (role in ('employee', 'compliance_officer')),
  created_by       uuid not null references public.profiles(user_id),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  used_by          uuid references public.profiles(user_id),
  used_at          timestamptz
);

create index if not exists idx_invites_org on public.invites(organization_id);

-- ----------------------------------------------------------------------------
-- weekly_reports / monthly_reports : 집계 스냅샷 누적
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_reports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  payload          jsonb not null,
  generated_at     timestamptz not null default now(),
  unique (organization_id, period_start)
);

create index if not exists idx_weekly_org on public.weekly_reports(organization_id, period_start desc);

create table if not exists public.monthly_reports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  payload          jsonb not null,
  generated_at     timestamptz not null default now(),
  unique (organization_id, period_start)
);

create index if not exists idx_monthly_org on public.monthly_reports(organization_id, period_start desc);

-- ----------------------------------------------------------------------------
-- audit_logs : 모든 admin 액션 추적
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  actor_user_id    uuid not null references public.profiles(user_id),
  action           text not null,
  target           text,
  payload          jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_audit_org_time on public.audit_logs(organization_id, created_at desc);
