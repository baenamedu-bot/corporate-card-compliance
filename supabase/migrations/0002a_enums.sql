-- =============================================================================
-- 0002a_enums.sql — enum 정의 (단독 트랜잭션)
-- PostgreSQL 은 enum 생성과 해당 enum 컬럼 생성을 같은 트랜잭션에 둘 수 없으므로
-- enum 만 먼저 커밋해야 한다. 0002b 가 이 enum 들을 사용한다.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('super_admin', 'admin', 'compliance_officer', 'employee');
  end if;

  if not exists (select 1 from pg_type where typname = 'card_status') then
    create type public.card_status as enum ('active', 'suspended', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'settlement_status') then
    create type public.settlement_status as enum ('pending', 'submitted', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'flag_severity') then
    create type public.flag_severity as enum ('low', 'medium', 'high', 'critical');
  end if;
end$$;

-- profiles.role 을 text → user_role 로 격상
alter table public.profiles
  alter column role drop default;

alter table public.profiles
  alter column role type public.user_role using role::public.user_role;

alter table public.profiles
  alter column role set default 'employee'::public.user_role;
