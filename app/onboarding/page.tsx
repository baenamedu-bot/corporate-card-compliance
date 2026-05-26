"use client";

import { useState } from "react";
import { Building2, KeyRound, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type Mode = "choose" | "create" | "join";

export default function OnboardingPage() {
  const [mode, setMode] = useState<Mode>("choose");

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        조직 설정을 시작하세요
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        새 회사를 만들거나 초대 코드로 기존 조직에 합류할 수 있습니다.
      </p>

      {mode === "choose" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ChoiceCard
            icon={Building2}
            title="새 회사로 시작"
            desc="우리 회사용 조직을 새로 만들고 관리자(admin)로 가입합니다. 이후 직원을 초대 코드로 합류시킬 수 있습니다."
            cta="새 회사 만들기"
            onClick={() => setMode("create")}
          />
          <ChoiceCard
            icon={KeyRound}
            title="초대 코드로 가입"
            desc="회사 관리자가 발급한 6자리 초대 코드를 입력해 기존 조직에 합류합니다."
            cta="초대 코드 입력"
            onClick={() => setMode("join")}
          />
        </div>
      )}

      {mode === "create" && <CreateOrgForm onBack={() => setMode("choose")} />}
      {mode === "join" && <JoinOrgForm onBack={() => setMode("choose")} />}
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  desc,
  cta,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-border/70 bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}

function CreateOrgForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.rpc("create_organization_for_me", {
        org_name: name,
        full_name: fullName || undefined,
        department: department || undefined,
      });
      if (error) {
        toast.error(translateError(error.message));
        return;
      }
      toast.success("조직이 생성되었습니다. 관리자로 가입되었습니다.");
      // 미들웨어 재평가를 위해 하드 네비게이션
      window.location.href = "/admin";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "조직 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">회사명 *</Label>
            <Input
              id="org-name"
              required
              minLength={1}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 유앤미자산운용"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="full-name">본인 이름 (선택)</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="홍길동"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="department">부서 (선택)</Label>
            <Input
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="경리팀 · 재무팀 등"
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            새 회사로 시작하면 본인이 <strong>관리자(admin)</strong>로 가입됩니다.
            이후 카드 등록·직원 초대를 할 수 있습니다.
          </div>

          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              뒤로
            </Button>
            <Button type="submit" disabled={loading} variant="accent">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              새 회사 만들기
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function JoinOrgForm({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(trimmed)) {
      toast.error("초대 코드는 6자리 영문 대문자·숫자입니다.");
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabaseBrowser();
      const { data, error } = await sb.rpc("claim_invite", {
        invite_code: trimmed,
        full_name: fullName || undefined,
        department: department || undefined,
      });
      if (error) {
        toast.error(translateError(error.message));
        return;
      }
      const role = Array.isArray(data) ? data[0]?.role : (data as { role?: string } | null)?.role;
      toast.success(
        role === "compliance_officer"
          ? "준법감시 담당자로 합류했습니다."
          : "직원으로 조직에 합류했습니다.",
      );
      window.location.href = role === "employee" ? "/my-card" : "/admin";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "초대 코드 사용 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-code">초대 코드 (6자리) *</Label>
            <Input
              id="invite-code"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="예: K7M2QX"
              className="font-mono tracking-[0.4em] uppercase"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="join-full-name">본인 이름 (선택)</Label>
            <Input
              id="join-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="홍길동"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="join-dept">부서 (선택)</Label>
            <Input
              id="join-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="영업본부 · 리서치 등"
            />
          </div>

          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              뒤로
            </Button>
            <Button type="submit" disabled={loading} variant="accent">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              조직 합류
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function translateError(msg: string): string {
  if (msg.includes("ALREADY_IN_ORGANIZATION")) return "이미 조직에 속해 있습니다.";
  if (msg.includes("INVALID_INVITE")) return "초대 코드를 찾을 수 없습니다.";
  if (msg.includes("INVITE_ALREADY_USED")) return "이미 사용된 초대 코드입니다.";
  if (msg.includes("INVITE_EXPIRED")) return "초대 코드가 만료되었습니다. 관리자에게 새 코드를 요청하세요.";
  if (msg.includes("ORG_NAME_REQUIRED")) return "회사명을 입력해주세요.";
  if (msg.includes("PERMISSION_DENIED")) return "권한이 없습니다.";
  if (msg.includes("AUTH_REQUIRED")) return "로그인이 필요합니다.";
  return msg;
}
