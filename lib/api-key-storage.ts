const API_KEY = "gemini_api_key";

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(API_KEY);
}

export function setApiKey(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(API_KEY, key.trim());
}

export function clearApiKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(API_KEY);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

/** 전역 이벤트: API 키 모달 자동 오픈 */
export const API_KEY_OPEN_EVENT = "ccc:open-api-key-modal";
export function requestApiKey() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(API_KEY_OPEN_EVENT));
}
