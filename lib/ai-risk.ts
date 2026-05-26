import { getGemini, parseJsonResponse } from "./gemini-client";
import type { RiskLevel, Transaction } from "./types";

interface AiRiskItem {
  id: string;
  level: RiskLevel;
  reasons: string[];
}

const PROMPT_HEADER = `당신은 한국 자산운용사·금융사의 컴플라이언스 담당자입니다.
법인카드 결제 내역의 위험도를 분석하세요.

위험 판단 기준:
- critical: 유흥업종(룸살롱·단란주점·노래방·텐프로·호스트바·캬바·마사지·안마·스파 등) 명확 의심, 200만원 이상 고액
- high: 100만원 이상 + 야간/주말 결제, 또는 의심 키워드 약함
- medium: 50만원 이상 + 야간(22-05시)/주말, 또는 업종이 모호함
- low: 일반 식음·교통·문구 등 정상 영업 활동

반드시 JSON 배열로만 응답:
[{"id":"...", "level":"low|medium|high|critical", "reasons":["짧은 한국어 사유 1개 이상"]}, ...]`;

export async function analyzeRiskBatch(txns: Transaction[]): Promise<AiRiskItem[]> {
  if (!txns.length) return [];
  const model = getGemini();
  const items = txns.map((t) => ({
    id: t.id,
    paidAt: t.paidAt,
    merchant: t.merchantName,
    category: t.merchantCategory || "",
    code: t.merchantCode || "",
    amount: t.amount,
  }));

  const prompt = `${PROMPT_HEADER}

[결제 내역]
${JSON.stringify(items, null, 2)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const arr = parseJsonResponse<AiRiskItem[]>(text);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x.id === "string")
    .map((x) => ({
      id: x.id,
      level: (["low", "medium", "high", "critical"].includes(x.level) ? x.level : "low") as RiskLevel,
      reasons: Array.isArray(x.reasons) ? x.reasons.filter(Boolean) : [],
    }));
}
