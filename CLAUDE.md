# 법인카드 컴플라이언스 모니터링 (Corporate Card Compliance)

자산운용사·금융사 대상 법인카드 지출 통제 & 컴플라이언스 모니터링 SaaS.

## 역할별 워크플로
1. **경리/재무**: 카드사(신한·삼성·국민·현대) 청구 엑셀 업로드 → Gemini가 컬럼 자동 매핑 → 표준 스키마로 저장
2. **영업 담당자**: 본인 카드번호 끝 4자리 입력 → 본인 결제만 조회 → 주 1회 [참석자 / 목적] 입력으로 정산
3. **준법감시/관리자**: 전사 결제 모니터링, 위험 결제 자동 탐지, 미입력자 현황, 주간/월간 보고서

## 금액 구간 통제 (핵심 룰)
| 금액 | 통제 |
| --- | --- |
| ~ 50만원 미만 | 일반 |
| 50만 ~ 100만 미만 | 사후 보고 확인 + 사전 승인서 존재 여부 체크박스 |
| 100만 ~ 200만 미만 | 사전 승인서 결재문서 번호 입력 필수 (미입력 시 저장 불가) |
| 200만 이상 | critical 등급 자동 분류 + 컴플라이언스 통보 표시 |

## 기술 스택
- Next.js 14 App Router + TypeScript
- Tailwind + shadcn/ui (자체 구현, registry 사용 안 함)
- Pretendard Variable (`@fontsource-variable/pretendard`)
- Gemini API: `@google/generative-ai` 클라이언트 직접 호출 (BYOK)
- xlsx (SheetJS) — 파싱 & 내보내기
- recharts — 대시보드 차트
- lucide-react — 아이콘 (이모지 금지)
- sonner — 토스트

## API 키 정책 (BYOK)
- localStorage `gemini_api_key` 에만 저장
- 서버 전송·.env 저장·API Route 중계 **금지**
- 헤더 ⚙️ → `<ApiKeyModal />` 로 설정
- AI 기능 호출 시 키 없으면 자동 오픈

## localStorage 키
| 키 | 용도 |
| --- | --- |
| `gemini_api_key` | Gemini API 키 |
| `welcome_shown` | 첫 방문 환영 모달 1회 |
| `ccc.transactions` | 전체 결제 내역 (정규화된 스키마) |
| `ccc.settlements` | 정산 입력값 (참석자/목적/승인번호) |
| `ccc.risk_assessments` | AI 위험 분석 결과 |
| `ccc.upload_batches` | 업로드 이력 (카드사·기간·건수) |
| `ccc.current_card_last4` | 영업 진입 세션 (끝 4자리) |

## 폴더 구조
```
app/
  layout.tsx, page.tsx, globals.css
  upload/page.tsx        # 경리: 엑셀 업로드
  my-card/page.tsx       # 영업: 카드 끝 4자리 진입 + 본인 내역
  admin/page.tsx         # 관리자 대시보드
  reports/page.tsx       # 보고서
components/
  branding/              # 유앤미스튜디오 브랜딩 (필수)
  settings/api-key-modal.tsx
  layout/header.tsx, container.tsx
  ui/                    # shadcn 자체 구현 (button, card, input, dialog, ...)
  upload/, my-card/, admin/, reports/
lib/
  types.ts               # 전 타입
  storage.ts             # localStorage 헬퍼
  api-key-storage.ts
  gemini-client.ts
  excel-utils.ts         # SheetJS 파싱/내보내기
  risk-rules.ts          # 금액 구간/시간대 룰
  format.ts              # 원화/날짜
  utils.ts               # cn
```

## 표준화 스키마 (Transaction)
```ts
{
  id, paidAt(ISO), merchantName, merchantCategory?, merchantCode?,
  amount, cardLast4, cardholderName?, department?, cardCompany,
  uploadedAt, uploadBatchId
}
```

## Gemini 프롬프트 요지
1. **컬럼 매핑**: 카드사 헤더 + 샘플 3행 → 표준 컬럼명으로 매핑한 JSON 반환
2. **위험 분류**: 가맹점명·업종·시간 → `{ level, reasons[] }` JSON 반환 (유흥/심야/주말 등)

## 카드사 프리셋 (토큰 절감)
`lib/card-presets.ts` — 신한·삼성·국민·현대·롯데·BC·하나·우리 8개 카드사 컬럼 매핑 프리셋.
- `detectCardCompany({fileName, sheetName, headers})`: 파일명 → 시트명 → 헤더 키워드 순으로 카드사 추정 (점수제)
- `applyPreset(company, headers)`: 후보 컬럼명으로 표준 매핑 생성. 필수 4개 필드 모두 매핑되어야 성공, 실패 시 null
- **업로드 흐름**: 파일 업로드 → detect → applyPreset 시도 → 성공 시 mapping 자동 설정(`mappingSource="preset"`) → AI 호출 0회
- **AI 폴백**: 프리셋 매칭 실패 시에만 `runAi()` 호출 가능. 사용자는 "AI로 다시 매핑"으로 강제 호출도 가능
- 사용자가 카드사를 수동 변경하면 프리셋 재시도 (단, AI/수동 매핑이 이미 있으면 덮어쓰지 않음)

## 디자인 토큰
- 베이스 zinc / 액센트 deep blue (slate-900, blue-700). violet/보라 금지
- 카드 rounded-xl, 버튼 h-11, CTA h-12, shadow-sm
- 위험도 표시는 amber/red 세로 라인·점·작은 배지만 (큰 색 면적 금지)
- max-w: 대시보드 6xl / 폼 2xl / 글 3xl
