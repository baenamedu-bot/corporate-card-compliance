import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApiKey, requestApiKey } from "./api-key-storage";

const MODEL = "gemini-2.0-flash";

export class MissingApiKeyError extends Error {
  constructor() {
    super("Gemini API 키가 설정되지 않았습니다.");
    this.name = "MissingApiKeyError";
  }
}

export function getGemini() {
  const key = getApiKey();
  if (!key) {
    requestApiKey();
    throw new MissingApiKeyError();
  }
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
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
