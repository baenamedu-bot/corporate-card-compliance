-- =============================================================================
-- 0004_functions.sql — SECURITY DEFINER RPC + 도메인 함수
-- - get_my_profile : 미들웨어가 RLS 컨텍스트 없이도 본인 profile 조회
-- - create_organization_for_me : 온보딩 "새 회사 시작"
-- - claim_invite : 온보딩 "초대 코드로 합류"
-- - create_invite_code : admin 이 6자리 코드 발급
-- - upload_card_transactions : 결제 일괄 insert + last4 → card_id 매칭
-- - generate_weekly_report / generate_monthly_report : 집계 + 누적
-- =============================================================================

-- ----------------------------------------------------------------------------
-- get_my_profile : RLS 우회 본인 조회 (미들웨어 전용)
-- ----------------------------------------------------------------------------
create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where user_id = auth.uid()
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

-- ----------------------------------------------------------------------------
-- create_organization_for_me : 온보딩 — 새 회사 + 본인 admin
-- ----------------------------------------------------------------------------
create or replace function public.create_organization_for_me(
  org_name text,
  full_name text default null,
  department text default null
)
returns table(organization_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_existing_org uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- 이미 조직에 속해 있으면 거부 (1:1 정책)
  select p.organization_id into v_existing_org
  from public.profiles p where p.user_id = v_user;

  if v_existing_org is not null then
    raise exception 'ALREADY_IN_ORGANIZATION';
  end if;

  if org_name is null or btrim(org_name) = '' then
    raise exception 'ORG_NAME_REQUIRED';
  end if;

  insert into public.organizations(name) values (btrim(org_name)) returning id into v_org;

  update public.profiles
     set organization_id = v_org,
         role = 'admin',
         full_name  = coalesce(create_organization_for_me.full_name, profiles.full_name),
         department = coalesce(create_organization_for_me.department, profiles.department)
   where user_id = v_user;

  -- audit
  insert into public.audit_logs(organization_id, actor_user_id, action, target, payload)
  values (v_org, v_user, 'organization.create', v_org::text, jsonb_build_object('name', org_name));

  return query select v_org;
end;
$$;

revoke all on function public.create_organization_for_me(text, text, text) from public;
grant execute on function public.create_organization_for_me(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- claim_invite : 6자리 코드로 조직 합류
-- ----------------------------------------------------------------------------
create or replace function public.claim_invite(
  invite_code text,
  full_name text default null,
  department text default null
)
returns table(organization_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.invites;
  v_existing_org uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select p.organization_id into v_existing_org
  from public.profiles p where p.user_id = v_user;
  if v_existing_org is not null then
    raise exception 'ALREADY_IN_ORGANIZATION';
  end if;

  select * into v_invite from public.invites
   where code = upper(btrim(invite_code))
   for update;

  if not found then
    raise exception 'INVALID_INVITE';
  end if;

  if v_invite.used_at is not null then
    raise exception 'INVITE_ALREADY_USED';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'INVITE_EXPIRED';
  end if;

  update public.profiles
     set organization_id = v_invite.organization_id,
         role = v_invite.role,
         full_name  = coalesce(claim_invite.full_name, profiles.full_name),
         department = coalesce(claim_invite.department, profiles.department)
   where user_id = v_user;

  update public.invites
     set used_by = v_user,
         used_at = now()
   where code = v_invite.code;

  insert into public.audit_logs(organization_id, actor_user_id, action, target, payload)
  values (v_invite.organization_id, v_user, 'invite.claim', v_invite.code,
          jsonb_build_object('role', v_invite.role::text));

  return query select v_invite.organization_id, v_invite.role;
end;
$$;

revoke all on function public.claim_invite(text, text, text) from public;
grant execute on function public.claim_invite(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- create_invite_code : admin 이 6자리 초대 코드 발급
-- ----------------------------------------------------------------------------
create or replace function public.create_invite_code(
  invite_role public.user_role,
  ttl_days int default 14
)
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_my_role public.user_role;
  v_code text;
  v_expires timestamptz := now() + (ttl_days || ' days')::interval;
  v_attempts int := 0;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select organization_id, role into v_org, v_my_role
  from public.profiles where user_id = v_user;

  if v_org is null then
    raise exception 'NO_ORGANIZATION';
  end if;
  if v_my_role not in ('admin', 'super_admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if invite_role not in ('employee', 'compliance_officer') then
    raise exception 'INVALID_ROLE';
  end if;
  if ttl_days < 1 or ttl_days > 90 then
    raise exception 'INVALID_TTL';
  end if;

  loop
    -- 6자리 영문대문자+숫자 (혼동 글자 O/0/I/1 제외)
    v_code := string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             1 + floor(random() * 32)::int, 1),
      ''
    ) from generate_series(1, 6);

    begin
      insert into public.invites(code, organization_id, role, created_by, expires_at)
      values (v_code, v_org, invite_role, v_user, v_expires);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 10 then
        raise exception 'COULD_NOT_GENERATE_CODE';
      end if;
    end;
  end loop;

  insert into public.audit_logs(organization_id, actor_user_id, action, target, payload)
  values (v_org, v_user, 'invite.create', v_code,
          jsonb_build_object('role', invite_role::text, 'expires_at', v_expires));

  return query select v_code, v_expires;
end;
$$;

revoke all on function public.create_invite_code(public.user_role, int) from public;
grant execute on function public.create_invite_code(public.user_role, int) to authenticated;

-- ----------------------------------------------------------------------------
-- upload_card_transactions : 일괄 insert + last4 매칭
--   payload = jsonb array of { paid_at, merchant, merchant_category, mcc_code, amount, card_last4, card_issuer, raw_data, source_file }
--   리턴: { inserted, matched, unmatched }
-- ----------------------------------------------------------------------------
create or replace function public.upload_card_transactions(payload jsonb)
returns table(inserted int, matched int, unmatched int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_my_role public.user_role;
  v_row jsonb;
  v_card_id uuid;
  v_inserted int := 0;
  v_matched int := 0;
  v_unmatched int := 0;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select organization_id, role into v_org, v_my_role
  from public.profiles where user_id = v_user;

  if v_org is null then
    raise exception 'NO_ORGANIZATION';
  end if;
  if v_my_role not in ('admin', 'super_admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  for v_row in select jsonb_array_elements(payload) loop
    v_card_id := null;
    select id into v_card_id
    from public.corporate_cards
    where organization_id = v_org
      and last4 = v_row->>'card_last4'
      and (v_row->>'card_issuer' is null or issuer = v_row->>'card_issuer')
    limit 1;

    if v_card_id is not null then v_matched := v_matched + 1;
    else v_unmatched := v_unmatched + 1;
    end if;

    insert into public.card_transactions(
      organization_id, card_id, card_last4, card_issuer,
      paid_at, merchant, merchant_category, mcc_code, amount,
      raw_data, source_file, uploaded_by
    ) values (
      v_org,
      v_card_id,
      v_row->>'card_last4',
      v_row->>'card_issuer',
      (v_row->>'paid_at')::timestamptz,
      v_row->>'merchant',
      v_row->>'merchant_category',
      v_row->>'mcc_code',
      (v_row->>'amount')::bigint,
      v_row->'raw_data',
      v_row->>'source_file',
      v_user
    );
    v_inserted := v_inserted + 1;
  end loop;

  insert into public.audit_logs(organization_id, actor_user_id, action, target, payload)
  values (v_org, v_user, 'transactions.upload', null,
          jsonb_build_object('inserted', v_inserted, 'matched', v_matched, 'unmatched', v_unmatched));

  return query select v_inserted, v_matched, v_unmatched;
end;
$$;

revoke all on function public.upload_card_transactions(jsonb) from public;
grant execute on function public.upload_card_transactions(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- generate_weekly_report : 주간 집계 → weekly_reports upsert
--   week_start 는 월요일 date
-- ----------------------------------------------------------------------------
create or replace function public.generate_weekly_report(org_id uuid, week_start date)
returns public.weekly_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_my_role public.user_role;
  v_my_org uuid;
  v_end date := week_start + 7;
  v_payload jsonb;
  v_row public.weekly_reports;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select role, organization_id into v_my_role, v_my_org
  from public.profiles where user_id = v_user;
  if not (v_my_role = 'super_admin' or (v_my_org = org_id and v_my_role in ('admin', 'compliance_officer'))) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'period_start', week_start,
    'period_end', v_end,
    'total_amount', coalesce(sum(t.amount), 0),
    'total_count', count(*),
    'pending_count', count(*) filter (
      where not exists (select 1 from public.transaction_settlements s where s.transaction_id = t.id)
    ),
    'critical_count', (
      select count(*) from public.compliance_flags f
       join public.card_transactions tt on tt.id = f.transaction_id
       where tt.organization_id = org_id
         and tt.paid_at >= week_start::timestamptz
         and tt.paid_at <  v_end::timestamptz
         and f.severity = 'critical'
    ),
    'by_department', (
      select coalesce(jsonb_agg(jsonb_build_object('department', dept, 'amount', total)
                                order by total desc), '[]'::jsonb)
      from (
        select coalesce(p.department, '미지정') as dept, sum(tt.amount) as total
          from public.card_transactions tt
          left join public.corporate_cards c on c.id = tt.card_id
          left join public.profiles p on p.user_id = c.assigned_to
         where tt.organization_id = org_id
           and tt.paid_at >= week_start::timestamptz
           and tt.paid_at <  v_end::timestamptz
         group by dept
      ) x
    )
  ) into v_payload
  from public.card_transactions t
  where t.organization_id = org_id
    and t.paid_at >= week_start::timestamptz
    and t.paid_at <  v_end::timestamptz;

  insert into public.weekly_reports(organization_id, period_start, period_end, payload)
  values (org_id, week_start, v_end, v_payload)
  on conflict (organization_id, period_start)
  do update set payload = excluded.payload, generated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.generate_weekly_report(uuid, date) from public;
grant execute on function public.generate_weekly_report(uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- generate_monthly_report
-- ----------------------------------------------------------------------------
create or replace function public.generate_monthly_report(org_id uuid, month_start date)
returns public.monthly_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_my_role public.user_role;
  v_my_org uuid;
  v_end date := (month_start + interval '1 month')::date;
  v_payload jsonb;
  v_row public.monthly_reports;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select role, organization_id into v_my_role, v_my_org
  from public.profiles where user_id = v_user;
  if not (v_my_role = 'super_admin' or (v_my_org = org_id and v_my_role in ('admin', 'compliance_officer'))) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'period_start', month_start,
    'period_end', v_end,
    'total_amount', coalesce(sum(t.amount), 0),
    'total_count', count(*),
    'pending_count', count(*) filter (
      where not exists (select 1 from public.transaction_settlements s where s.transaction_id = t.id)
    )
  ) into v_payload
  from public.card_transactions t
  where t.organization_id = org_id
    and t.paid_at >= month_start::timestamptz
    and t.paid_at <  v_end::timestamptz;

  insert into public.monthly_reports(organization_id, period_start, period_end, payload)
  values (org_id, month_start, v_end, v_payload)
  on conflict (organization_id, period_start)
  do update set payload = excluded.payload, generated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.generate_monthly_report(uuid, date) from public;
grant execute on function public.generate_monthly_report(uuid, date) to authenticated;
