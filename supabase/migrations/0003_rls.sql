-- =============================================================================
-- 0003_rls.sql — RLS enable + 정책
-- 멀티테넌트 격리 + 4-tier role (super_admin / admin / compliance_officer / employee)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 헬퍼: 본인 organization_id / role 을 RLS 우회로 조회
--   - 정책 안에서 profiles 를 직접 SELECT 하면 무한 재귀 발생 → SECURITY DEFINER 함수로
-- ----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where user_id = auth.uid()),
    false
  )
$$;

create or replace function public.is_admin_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'super_admin') from public.profiles where user_id = auth.uid()),
    false
  )
$$;

create or replace function public.is_compliance_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'compliance_officer', 'super_admin') from public.profiles where user_id = auth.uid()),
    false
  )
$$;

-- ============================================================================
-- organizations
-- ============================================================================
alter table public.organizations enable row level security;

drop policy if exists "org_select_own" on public.organizations;
create policy "org_select_own" on public.organizations
  for select using (
    id = public.current_org_id() or public.is_super_admin()
  );

drop policy if exists "org_insert_authenticated" on public.organizations;
create policy "org_insert_authenticated" on public.organizations
  for insert with check (auth.uid() is not null);

drop policy if exists "org_update_admin" on public.organizations;
create policy "org_update_admin" on public.organizations
  for update using (
    (id = public.current_org_id() and public.is_admin_or_above()) or public.is_super_admin()
  );

-- ============================================================================
-- profiles
-- ============================================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_org" on public.profiles;
create policy "profiles_select_self_or_org" on public.profiles
  for select using (
    user_id = auth.uid()
    or (organization_id = public.current_org_id() and public.is_compliance_or_above())
    or public.is_super_admin()
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- 자가 승격 차단: role 변경은 RPC(admin) 또는 SQL Editor(super_admin) 로만
    and role = (select role from public.profiles where user_id = auth.uid())
  );

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

-- ============================================================================
-- corporate_cards
-- ============================================================================
alter table public.corporate_cards enable row level security;

drop policy if exists "cards_select_org" on public.corporate_cards;
create policy "cards_select_org" on public.corporate_cards
  for select using (
    organization_id = public.current_org_id() or public.is_super_admin()
  );

drop policy if exists "cards_modify_admin" on public.corporate_cards;
create policy "cards_modify_admin" on public.corporate_cards
  for all using (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

-- ============================================================================
-- card_transactions
--   employee = 본인에게 할당된 카드의 결제만 SELECT
--   admin / compliance_officer = 조직 전체
-- ============================================================================
alter table public.card_transactions enable row level security;

drop policy if exists "txn_select_scope" on public.card_transactions;
create policy "txn_select_scope" on public.card_transactions
  for select using (
    public.is_super_admin()
    or (
      organization_id = public.current_org_id()
      and (
        public.is_compliance_or_above()
        or card_id in (
          select id from public.corporate_cards where assigned_to = auth.uid()
        )
      )
    )
  );

drop policy if exists "txn_insert_admin" on public.card_transactions;
create policy "txn_insert_admin" on public.card_transactions
  for insert with check (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

drop policy if exists "txn_update_admin" on public.card_transactions;
create policy "txn_update_admin" on public.card_transactions
  for update using (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

drop policy if exists "txn_delete_admin" on public.card_transactions;
create policy "txn_delete_admin" on public.card_transactions
  for delete using (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

-- ============================================================================
-- transaction_settlements
--   employee = 본인 카드 결제의 정산만 INSERT/UPDATE
--   admin / compliance = 조직 전체 SELECT, admin 만 UPDATE 가능
-- ============================================================================
alter table public.transaction_settlements enable row level security;

drop policy if exists "settle_select_scope" on public.transaction_settlements;
create policy "settle_select_scope" on public.transaction_settlements
  for select using (
    public.is_super_admin()
    or transaction_id in (
      select t.id from public.card_transactions t
      where t.organization_id = public.current_org_id()
        and (
          public.is_compliance_or_above()
          or t.card_id in (select id from public.corporate_cards where assigned_to = auth.uid())
        )
    )
  );

drop policy if exists "settle_insert_self" on public.transaction_settlements;
create policy "settle_insert_self" on public.transaction_settlements
  for insert with check (
    settled_by = auth.uid()
    and (
      transaction_id in (
        select t.id from public.card_transactions t
        where t.organization_id = public.current_org_id()
          and (
            public.is_admin_or_above()
            or t.card_id in (select id from public.corporate_cards where assigned_to = auth.uid())
          )
      )
    )
  );

drop policy if exists "settle_update_self_or_admin" on public.transaction_settlements;
create policy "settle_update_self_or_admin" on public.transaction_settlements
  for update using (
    settled_by = auth.uid()
    or transaction_id in (
      select t.id from public.card_transactions t
      where t.organization_id = public.current_org_id()
        and public.is_admin_or_above()
    )
    or public.is_super_admin()
  );

-- ============================================================================
-- compliance_flags
--   조회: admin / compliance_officer / super_admin + 본인 카드 결제는 employee 도
--   변경: admin / super_admin (룰 베이스 insert는 admin 권한으로 업로드 시 함께 수행)
-- ============================================================================
alter table public.compliance_flags enable row level security;

drop policy if exists "flags_select_scope" on public.compliance_flags;
create policy "flags_select_scope" on public.compliance_flags
  for select using (
    public.is_super_admin()
    or transaction_id in (
      select t.id from public.card_transactions t
      where t.organization_id = public.current_org_id()
        and (
          public.is_compliance_or_above()
          or t.card_id in (select id from public.corporate_cards where assigned_to = auth.uid())
        )
    )
  );

drop policy if exists "flags_modify_admin" on public.compliance_flags;
create policy "flags_modify_admin" on public.compliance_flags
  for all using (
    transaction_id in (
      select t.id from public.card_transactions t
      where t.organization_id = public.current_org_id()
        and public.is_admin_or_above()
    )
    or public.is_super_admin()
  )
  with check (
    transaction_id in (
      select t.id from public.card_transactions t
      where t.organization_id = public.current_org_id()
        and public.is_admin_or_above()
    )
    or public.is_super_admin()
  );

-- ============================================================================
-- invites
--   admin 만 발급. 모든 사용자가 code 로 SELECT 가능 (claim_invite RPC 에서 사용)
--   → 정책 측면에선 SECURITY DEFINER RPC 로 처리하고 직접 SELECT 는 admin/super 만
-- ============================================================================
alter table public.invites enable row level security;

drop policy if exists "invites_select_admin" on public.invites;
create policy "invites_select_admin" on public.invites
  for select using (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

drop policy if exists "invites_modify_admin" on public.invites;
create policy "invites_modify_admin" on public.invites
  for all using (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

-- ============================================================================
-- weekly / monthly reports
-- ============================================================================
alter table public.weekly_reports enable row level security;
alter table public.monthly_reports enable row level security;

drop policy if exists "weekly_select_org" on public.weekly_reports;
create policy "weekly_select_org" on public.weekly_reports
  for select using (
    organization_id = public.current_org_id() or public.is_super_admin()
  );

drop policy if exists "weekly_modify_admin" on public.weekly_reports;
create policy "weekly_modify_admin" on public.weekly_reports
  for all using (
    (organization_id = public.current_org_id() and public.is_compliance_or_above())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_org_id() and public.is_compliance_or_above())
    or public.is_super_admin()
  );

drop policy if exists "monthly_select_org" on public.monthly_reports;
create policy "monthly_select_org" on public.monthly_reports
  for select using (
    organization_id = public.current_org_id() or public.is_super_admin()
  );

drop policy if exists "monthly_modify_admin" on public.monthly_reports;
create policy "monthly_modify_admin" on public.monthly_reports
  for all using (
    (organization_id = public.current_org_id() and public.is_compliance_or_above())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_org_id() and public.is_compliance_or_above())
    or public.is_super_admin()
  );

-- ============================================================================
-- audit_logs : admin / super_admin 만 SELECT, INSERT 는 정책상 일단 admin 위주
-- ============================================================================
alter table public.audit_logs enable row level security;

drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs
  for select using (
    (organization_id = public.current_org_id() and public.is_admin_or_above())
    or public.is_super_admin()
  );

drop policy if exists "audit_insert_authed" on public.audit_logs;
create policy "audit_insert_authed" on public.audit_logs
  for insert with check (
    actor_user_id = auth.uid()
    and (
      organization_id = public.current_org_id()
      or public.is_super_admin()
    )
  );
