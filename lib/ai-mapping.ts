import { getGemini, parseJsonResponse } from "./gemini-client";
import type { ColumnMapping } from "./types";

const SYSTEM_INSTRUCTION = `당신은 한국 카드사(신한, 삼성, 국민, 현대, 롯데, BC, NH농협, 하나) 청구 엑셀의 컬럼을 표준 스키마로 매핑하는 전문가입니다.
주어진 헤더 목록과 샘플 행을 보고, 각 표준 컬럼에 가장 적절한 원본 컬럼명을 정확히 그대로 매핑해야 합니다.
반드시 JSON으로만 응답하세요.`;

interface PromptInput {
  headers: string[];
  sampleRows: Record<string, unknown>[];
}

export async function mapColumnsWithAI(input: PromptInput): Promise<ColumnMapping> {
  const model = getGemini();

  const prompt = `다음은 한국 카드사 청구 엑셀의 컬럼 헤더와 샘플 데이터입니다.

[헤더 목록]
${JSON.stringify(input.headers)}

[샘플 행 (최대 3행)]
${JSON.stringify(input.sampleRows, null, 2)}

이를 다음 표준 컬럼으로 매핑한 JSON을 반환하세요.
- paidAt: 결제일시 (날짜+시간이면 더 좋음. 없으면 결제일 컬럼)
- merchantName: 가맹점명 (이용가맹점, 가맹점, 사용처 등)
- amount: 결제금액 (이용금액, 청구금액, 매출액 — 원 단위 숫자)
- cardLast4: 카드번호 끝 4자리가 포함된 컬럼 (전체 카드번호여도 됨)
- merchantCategory: 업종/업태 컬럼명 (있으면)
- merchantCode: 업종코드 컬럼명 (있으면)
- cardholderName: 카드 소지자/사용자명 (있으면)
- department: 부서/소속 (있으면)
- confidence: 매핑 신뢰도 0~1
- notes: 모호한 부분 짧게 (없으면 빈 문자열)

JSON 스키마:
{
  "paidAt": "원본 컬럼명",
  "merchantName": "원본 컬럼명",
  "amount": "원본 컬럼명",
  "cardLast4": "원본 컬럼명",
  "merchantCategory": "원본 컬럼명 또는 null",
  "merchantCode": "원본 컬럼명 또는 null",
  "cardholderName": "원본 컬럼명 또는 null",
  "department": "원본 컬럼명 또는 null",
  "confidence": 0.0,
  "notes": ""
}

반드시 헤더 목록에 실제 존재하는 컬럼명만 사용하세요. 적절한 컬럼이 없으면 null.`;

  const result = await model.generateContent({
    contents: [
      { role: "user", parts: [{ text: SYSTEM_INSTRUCTION + "\n\n" + prompt }] },
    ],
  });
  const text = result.response.text();
  const parsed = parseJsonResponse<ColumnMapping & { [k: string]: unknown }>(text);

  // null/undefined optional 필드 정리
  return {
    paidAt: String(parsed.paidAt || ""),
    merchantName: String(parsed.merchantName || ""),
    amount: String(parsed.amount || ""),
    cardLast4: String(parsed.cardLast4 || ""),
    merchantCategory: parsed.merchantCategory ? String(parsed.merchantCategory) : undefined,
    merchantCode: parsed.merchantCode ? String(parsed.merchantCode) : undefined,
    cardholderName: parsed.cardholderName ? String(parsed.cardholderName) : undefined,
    department: parsed.department ? String(parsed.department) : undefined,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}
