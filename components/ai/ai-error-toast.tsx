import { toast } from "sonner";
import { GeminiCallError, MissingApiKeyError } from "@/lib/gemini-client";

function ErrorDetails({ detail }: { detail: string }) {
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700">
        상세 원인 보기
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-100 p-2 text-[11px] leading-relaxed text-zinc-600">
        {detail}
      </pre>
    </details>
  );
}

/**
 * Gemini 호출 실패를 사용자 친화 토스트로 표시.
 * - MissingApiKeyError: 키 설정 안내 (모달은 호출부에서 이미 열림)
 * - GeminiCallError: 친화 메시지 + raw 원인은 접기 영역에. 404 모델 에러는 새로고침 안내
 * - 그 외: fallbackTitle + 접기 영역
 */
export function showAiError(e: unknown, fallbackTitle = "AI 호출 실패") {
  if (e instanceof MissingApiKeyError) {
    toast.message("Gemini API 키가 필요합니다. 우측 상단 ⚙️ 버튼에서 설정해주세요.");
    return;
  }
  if (e instanceof GeminiCallError) {
    toast.error(e.userMessage, {
      description: e.detail ? <ErrorDetails detail={e.detail} /> : undefined,
      duration: 8000,
    });
    return;
  }
  const detail = e instanceof Error ? e.message : String(e);
  toast.error(fallbackTitle, {
    description: <ErrorDetails detail={detail} />,
    duration: 8000,
  });
}
