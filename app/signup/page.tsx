"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Mail, Lock, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ email: string; needConfirm: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password.length < 8) {
      toast.error("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabaseBrowser();
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }
      const needConfirm = !data.session; // 이메일 확인 흐름인지
      setDone({ email, needConfirm });
      if (!needConfirm) {
        // 자동 로그인됐으면 온보딩으로 바로
        window.location.href = "/onboarding";
        return;
      }
      toast.success("가입 메일을 확인하세요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "회원가입 실패");
    } finally {
      setLoading(false);
    }
  };

  if (done && done.needConfirm) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-md flex-col justify-center px-6 py-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {done.email} 로 인증 메일을 보냈습니다
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          메일함의 링크를 클릭하면 가입이 완료됩니다. 인증 후{" "}
          <Link href="/login" className="text-accent underline-offset-4 hover:underline">
            로그인
          </Link>
          하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">법인카드 컴플라이언스</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Corporate Card Compliance
          </p>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">회원가입</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        가입 후 새 회사를 생성하거나 초대 코드로 합류할 수 있습니다.
      </p>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">이메일</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">비밀번호 (8자 이상)</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading} variant="accent">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              가입하기
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
