"use client";

import { useEffect, useState } from "react";
import {
  KeyRound,
  Plus,
  Loader2,
  Copy,
  Trash2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Container, PageHeader } from "@/components/layout/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInviteCode, listInvites, revokeInvite } from "@/lib/db/invites";
import type { Invite, UserRole } from "@/lib/supabase/types";
import { formatDateTime } from "@/lib/format";

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Extract<UserRole, "employee" | "compliance_officer">>("employee");
  const [ttlDays, setTtlDays] = useState(14);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    try {
      setInvites(await listInvites());
    } catch (e) {
      toast.error("로딩 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const { code, expires_at } = await createInviteCode({ role, ttl_days: ttlDays });
      toast.success(`초대 코드 발급: ${code} (만료 ${formatDateTime(expires_at)})`);
      await reload();
    } catch (e) {
      toast.error("발급 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (code: string) => {
    if (!confirm(`초대 코드 ${code} 를 삭제할까요?`)) return;
    try {
      await revokeInvite(code);
      toast.success("초대 코드가 삭제되었습니다.");
      await reload();
    } catch (e) {
      toast.error("삭제 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).then(
      () => toast.success(`${code} 복사됨`),
      () => toast.error("복사 실패"),
    );
  };

  const active = invites.filter((i) => !i.used_at && new Date(i.expires_at) > new Date());
  const used = invites.filter((i) => i.used_at);
  const expired = invites.filter((i) => !i.used_at && new Date(i.expires_at) <= new Date());

  return (
    <Container size="lg">
      <PageHeader
        title="직원 초대"
        description="6자리 초대 코드를 발급해 직원에게 공유하세요. 외부 이메일 발송 없이 화면에 표시 + 복사만 됩니다."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">활성 초대 코드 ({active.length})</CardTitle>
            <CardDescription>아직 사용되지 않은 유효 코드</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                불러오는 중...
              </div>
            ) : active.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <KeyRound className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">활성 초대 코드가 없습니다</p>
                <p className="text-xs text-muted-foreground">우측 폼에서 발급하세요.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {active.map((i) => (
                  <div key={i.code} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center rounded-md bg-accent text-accent-foreground px-3 py-1.5 font-mono text-base font-bold tracking-[0.3em]">
                        {i.code}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{roleLabel(i.role)}</p>
                        <p className="text-xs text-muted-foreground">
                          만료 {formatDateTime(i.expires_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => copy(i.code)}>
                        <Copy className="h-3.5 w-3.5" />
                        복사
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => revoke(i.code)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(used.length > 0 || expired.length > 0) && (
              <div className="mt-6 border-t border-border/60 pt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  사용/만료된 코드 ({used.length + expired.length})
                </p>
                <div className="divide-y divide-border/40">
                  {[...used, ...expired].slice(0, 10).map((i) => (
                    <div key={i.code} className="flex items-center justify-between py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono tracking-[0.2em] text-muted-foreground line-through">
                          {i.code}
                        </span>
                        <span className="text-muted-foreground">{roleLabel(i.role)}</span>
                      </div>
                      {i.used_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          사용됨 · {formatDateTime(i.used_at)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          만료됨
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">새 초대 코드 발급</CardTitle>
            <CardDescription>역할과 유효기간을 선택하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label>역할</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">영업 직원 (employee)</SelectItem>
                  <SelectItem value="compliance_officer">준법감시 담당자 (compliance_officer)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {role === "employee"
                  ? "본인에게 할당된 카드 결제만 보이고 정산 입력 가능"
                  : "조직 전체 결제·정산 읽기 + 보고서 생성"}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>유효기간 (일)</Label>
              <Select value={String(ttlDays)} onValueChange={(v) => setTtlDays(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3일</SelectItem>
                  <SelectItem value="7">7일</SelectItem>
                  <SelectItem value="14">14일</SelectItem>
                  <SelectItem value="30">30일</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={create} size="lg" className="w-full" disabled={creating} variant="accent">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              초대 코드 발급
            </Button>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
              발급 후 코드를 직원에게 직접 전달하세요. 직원은 회원가입 → 온보딩에서 "초대 코드로 가입"을 선택해 합류합니다.
            </div>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}

function roleLabel(r: UserRole): string {
  return {
    super_admin: "최고관리자",
    admin: "관리자",
    compliance_officer: "준법감시 담당자",
    employee: "영업 직원",
  }[r];
}
