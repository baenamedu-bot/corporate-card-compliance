"use client";

import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * 브라우저용 Supabase 클라이언트 (singleton).
 * Database 제네릭은 supabase-js 의 RPC Args 추론과 충돌하므로 의도적으로 untyped.
 * 결과는 호출처에서 lib/supabase/types 의 타입으로 좁힌다.
 */
export function getSupabaseBrowser() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase 환경변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 확인하세요.",
    );
  }
  _client = createBrowserClient(url, anon);
  return _client;
}
