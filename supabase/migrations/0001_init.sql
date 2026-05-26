-- =============================================================================
-- 0001_init.sql — 조직 + profiles 기본
-- 멀티테넌트 SaaS 의 뿌리. 이후 enum, RLS, RPC 가 이 위에 쌓임.
-- =============================================================================

-- pgcrypto: gen_random_uuid()
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  created_at  timestamptz not null default now()
);

comment on table public.organizations is '회사 단위 격리. 모든 도메인 데이터의 테넌트 키.';

-- ----------------------------------------------------------------------------
-- profiles  (auth.users 1:1)
--   role 컬럼은 0002a_enums 에서 enum 으로 alter — 일단 text 로 시작.
--   organization_id NULL 허용: 가입 직후 온보딩 전 상태.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete set null,
  role             text not null default 'employee',
  full_name        text,
  department       text,
  created_at       timestamptz not null default now()
);

comment on table public.profiles is '사용자 프로파일. auth.users 와 1:1. organization_id NULL = 온보딩 미완료.';

create index if not exists idx_profiles_org on public.profiles(organization_id);

-- ----------------------------------------------------------------------------
-- auth.users 생성 시 빈 profile 자동 생성 (온보딩으로 채워짐)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'employee')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
