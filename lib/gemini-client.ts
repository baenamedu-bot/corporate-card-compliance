import {
  GoogleGenerativeAI,
  type GenerateContentRequest,
} from "@google/generative-ai";
import { getApiKey, requestApiKey } from "./api-key-storage";

/**
 * 프로젝트 전역에서 사용하는 Gemini 모델.
 * 모든 호출은 이 상수만 참조한다 (모델명 하드코딩 금지).
 * - primary: 균형형 (정확도 우선)
 * - fallback: 저비용·저지연 (primary 실패 시 자동 폴백)
 */
export const GEMINI_MODELS = {
  primary: "gemini-2.5-flash",
  fallback: "gemini-2.5-flash-lite",
} as const;

const GENERATION_CONFIG = {
  temperature: 0.1,
  responseMimeType: "application/json" as const,
};

export class MissingApiKeyError extends Error {
  constructor() {
    super("Gemini API 키가 설정되지 않았습니다.");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Gemini 호출이 (폴백 포함) 최종 실패했을 때 던지는 에러.
 * UI 친화 메시지(userMessage)와 상세 원인(detail)을 분리해 담는다.
 */
export class GeminiCallError extends Error {
  /** 사용자에게 그대로 보여줄 친화 메시지 */
  readonly userMessage: string;
  /** raw 원인 — toast 의 details 접기 영역에 표시 */
  readonly detail: string;
  /** 모델 자체가 사라진 경우 (404 / no longer available) */
  readonly modelUnavailable: boolean;

  constructor(opts: {
    userMessage: string;
    detail: string;
    modelUnavailable: boolean;
  }) {
    super(opts.userMessage);
    this.name = "GeminiCallError";
    this.userMessage = opts.userMessage;
    this.detail = opts.detail;
    this.modelUnavailable = opts.modelUnavailable;
  }
}

function getClient(): GoogleGenerativeAI {
  const key = getApiKey();
  if (!key) {
    requestApiKey();
    throw new MissingApiKeyError();
  }
  return new GoogleGenerativeAI(key);
}

interface ClassifiedError {
  retriable: boolean;
  modelUnavailable: boolean;
  message: string;
}

/** SDK 에러를 폴백 판단용으로 분류 (404/429/5xx 는 재시도 대상) */
function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;

  const modelUnavailable =
    status === 404 ||
    lower.includes("no longer available") ||
    lower.includes("not found") ||
    lower.includes("is not supported");
  const rateLimited =
    status === 429 || lower.includes("rate limit") || lower.includes("quota");
  const serverError =
    (status !== undefined && status >= 500) ||
    lower.includes("internal error") ||
    lower.includes("overloaded") ||
    lower.includes("unavailable");

  return {
    retriable: modelUnavailable || rateLimited || serverError,
    modelUnavailable,
    message,
  };
}

/**
 * primary → fallback 순으로 JSON 응답을 받아온다.
 * 모든 Gemini 호출 지점은 이 함수만 사용한다.
 * @returns 모델이 반환한 원문 텍스트 (parseJsonResponse 로 파싱)
 */
export async function generateJson(
  request: GenerateContentRequest | string,
): Promise<string> {
  const client = getClient();
  const chain = [GEMINI_MODELS.primary, GEMINI_MODELS.fallback] as const;
  let last: ClassifiedError | null = null;

  for (let i = 0; i < chain.length; i++) {
    try {
      const model = client.getGenerativeModel({
        model: chain[i],
        generationConfig: GENERATION_CONFIG,
      });
      const result = await model.generateContent(request);
      return result.response.text();
    } catch (err) {
      last = classifyError(err);
      const isLast = i === chain.length - 1;
      if (isLast || !last.retriable) break;
      console.warn(
        `[gemini] primary failed, retrying with lite`,
        last.message,
      );
    }
  }

  const detail = last?.message ?? "알 수 없는 오류";
  if (last?.modelUnavailable) {
    throw new GeminiCallError({
      userMessage: "AI 모델이 업데이트되었습니다. 페이지를 새로고침해 주세요.",
      detail,
      modelUnavailable: true,
    });
  }
  throw new GeminiCallError({
    userMessage:
      "AI 모델 호출 실패. ⚙️에서 API 키를 다시 확인하거나 잠시 후 재시도해 주세요.",
    detail,
    modelUnavailable: false,
  });
}

/** JSON 응답을 안전하게 파싱 */
export function parseJsonResponse<T>(text: string): T {
  const trimmed = text.trim();
  // ```json ... ``` 코드 블록 제거
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
