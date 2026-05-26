# Supabase 멀티테넌트 SaaS 전환 매핑

대상 프로젝트: `cnrgitudyobqbointtop.supabase.co` (사용자 보유, SQL Editor에 수동 실행)
참조 패턴: 디자인하다(overtime log) 앱 — `get_my_profile()` security-definer RPC, 온보딩 후 `window.location.href` 하드 네비게이션, 4-tier role

## 1. 데이터 모델 (public 스키마)

| 테이블 | 핵심 컬럼 | RLS 요지 |
|---|---|---|
| `organizations` | id, name, created_at | 자기 조직만 SELECT |
| `profiles` | user_id PK, organization_id, role, full_name, department | 본인만 SELECT/UPDATE, super_admin 전체 |
| `corporate_cards` | id, organization_id, issuer, card_name, last4, assigned_to, status | 같은 조직 멤버 SELECT, admin/super_admin INSERT/UPDATE |
| `card_transactions` | id, organization_id, card_id, paid_at, merchant, mcc_code, amount, raw_data jsonb, source_file, uploaded_by | employee = 본인 할당 카드의 결제만 / admin·compliance = 조직 전체 |
| `transaction_settlements` | id, transaction_id, attendees, purpose, approval_doc_number, status, settled_by, settled_at | employee = 본인 카드 정산만 / admin·compliance = 조직 전체 |
| `compliance_flags` | id, transaction_id, severity, rule_type, detail, created_at, resolved_at | admin·compliance·super_admin |
| `invites` | code(6자리), organization_id, role, created_by, expires_at, used_by, used_at | admin INSERT, anyone SELECT by code |
| `weekly_reports` / `monthly_reports` | id, organization_id, period_start, period_end, payload jsonb, generated_at | 조직 단위 SELECT |
| `audit_logs` | id, organization_id, actor_user_id, action, target, payload jsonb, created_at | admin·super_admin SELECT, 모든 admin 액션 INSERT |

## 2. enum 분리 (마이그레이션 시퀀싱)

PostgreSQL은 enum 생성과 그 enum을 사용하는 컬럼 생성을 같은 트랜잭션에서 못 함 → 파일 분리.

```
supabase/migrations/
  0001_init.sql           -- organizations, profiles 기본 (enum 없이 시작)
  0002a_enums.sql         -- user_role, settlement_status, flag_severity, card_status, invite_role
  0002b_tables.sql        -- 위 enum 사용하는 corporate_cards, card_transactions, settlements, flags, invites, reports, audit_logs
  0003_rls.sql            -- 모든 테이블 RLS enable + 정책
  0004_functions.sql      -- get_my_profile, claim_invite, generate_weekly_report 등 security definer RPC
```

## 3. 코드 → Supabase 매핑

| 기존 코드 | 변경 후 |
|---|---|
| `lib/storage.ts` (localStorage CRUD) | `lib/db/{cards,transactions,settlements,flags,reports}.ts` (Supabase client 호출) |
| `lib/api-key-storage.ts` | **유지** — Gemini 키는 BYOK, localStorage 그대로 |
| `lib/gemini-client.ts` | **유지** — 클라이언트 직접 호출 |
| `lib/ai-mapping.ts`, `lib/ai-risk.ts` | **유지** — 호출 결과를 Supabase에 저장만 |
| `lib/card-presets.ts` | **유지** — 카드사 8종 프리셋 그대로 |
| `lib/compliance/restricted-categories.ts` | **유지** — KSIC + 정규식 사전 그대로 |
| `lib/risk-rules.ts` | **유지** — 룰 베이스 분류 그대로 |
| `lib/excel-utils.ts` | **유지** — SheetJS 파싱·내보내기 그대로, 결과를 DB insert |
| `lib/pdf-export.ts` | **유지** — html2canvas+jsPDF 그대로 |
| `app/page.tsx` (홈) | 역할별 카드 진입 → 로그인 상태·role에 따라 자동 라우팅 |
| `app/upload/page.tsx` | 결과 저장: `card_transactions` insert + last4로 `corporate_cards.id` 자동 매칭 |
| `app/my-card/page.tsx` | "카드 끝 4자리 진입" 제거 → 로그인 사용자에게 할당된 카드 결제 자동 표시 |
| `app/admin/page.tsx` | RLS로 조직 전체 결제 SELECT, 위험·미정산 집계 |
| `app/reports/page.tsx` | `weekly_reports`/`monthly_reports` 조회 + 실시간 집계 폴백 |
| `components/my-card/transaction-item.tsx` | upsert 대상이 `transaction_settlements` 테이블로 변경 |

## 4. 추가될 페이지

| 경로 | 역할 | 설명 |
|---|---|---|
| `/login` | 비로그인 | 이메일+비밀번호 로그인, 회원가입 링크 |
| `/signup` | 비로그인 | 이메일 인증 가입 |
| `/onboarding` | 로그인+미온보딩 | "새 회사 시작" / "초대 코드로 합류" 분기 |
| `/admin/cards` | admin | 법인카드 등록·끝 4자리·직원 할당 |
| `/admin/invites` | admin | 6자리 초대 코드 발급, 활성 코드 목록 |

## 5. 미들웨어 라우팅

- 공개 경로: `/login`, `/signup`, `/auth/callback`
- 비로그인 → `/login`
- 로그인했지만 profile 없거나 organization_id NULL → `/onboarding`
- 온보딩 완료 → 본인 role 기본 페이지 (employee → `/my-card`, admin → `/admin`, compliance → `/admin`)
- `get_my_profile()` RPC는 SECURITY DEFINER로 RLS 우회 (미들웨어가 RLS 컨텍스트 없이도 본인 profile 조회 가능)

## 6. 변경 안 함 (기존 정책 유지)

- Gemini BYOK (localStorage), 서버 중계 없음
- 카드사 프리셋 8종 + AI 폴백
- KSIC 분류 사전 + AI 모호 케이스만
- PDF 출력, 엑셀 내보내기
- 유앤미스튜디오 브랜딩 (Footer, CreatorInfoModal, WelcomeModal)
- 디자인 토큰 (zinc + deep blue)

## 7. 작업하지 않음 (1차 출시 범위 밖)

- 결제 시스템, 플랜 분기
- 외부 이메일 발송 (초대는 6자리 코드 화면 표시 + 복사)
- 카드사 OAuth/API 연동

## 8. 환경 변수

- `NEXT_PUBLIC_SUPABASE_URL` — `https://cnrgitudyobqbointtop.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — 클라이언트 노출 가능 anon key
- ⚠️ service role key는 **절대** 클라이언트·git에 두지 않음
- `.env.local.example` 에 키 이름만, 실제 값은 Vercel Dashboard → Settings → Environment Variables

## 9. 데모 데이터 흐름

1. super_admin (최인영)이 SQL Editor에서 본인 user_id로 profiles.role='super_admin' 수동 부여
2. 회사 admin이 `/signup` → `/onboarding` "새 회사 시작" → 조직 생성 + 본인 admin
3. admin이 `/admin/invites` 에서 초대 코드 발급 → 직원에게 공유
4. 직원이 `/signup` → `/onboarding` "초대 코드 입력" → 조직 합류 (role=employee 기본)
5. admin이 `/admin/cards` 에서 법인카드 등록 + 직원 할당
6. admin이 `/upload` 에서 카드사 청구 엑셀 업로드 → `card_transactions` 저장 + last4로 `corporate_cards.id` 매칭
7. 직원이 로그인 → `/my-card` 본인 카드 결제만 자동 표시 → 정산 입력
8. 위험 결제 자동 분류 (룰) + 모호 케이스 AI 보강 (admin이 실행)
9. 주간/월간 보고서 자동 생성 또는 수동 트리거
