"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  Plus,
  Loader2,
  Trash2,
  CheckCircle2,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { Container, PageHeader } from "@/components/layout/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCard,
  deleteCard,
  listCards,
  listOrgMembers,
  updateCard,
} from "@/lib/db/cards";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { CorporateCard, Profile } from "@/lib/supabase/types";
import { maskCard } from "@/lib/format";

const ISSUERS = ["신한", "삼성", "국민", "현대", "롯데", "BC", "NH농협", "하나", "우리", "기타"];

export default function AdminCardsPage() {
  const [cards, setCards] = useState<CorporateCard[]>([]);
  const [members, setMembers] = useState<
    Array<{ user_id: string; full_name: string | null; department: string | null; role: string }>
  >([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const reload = async () => {
    try {
      const [c, m] = await Promise.all([listCards(), listOrgMembers()]);
      setCards(c);
      setMembers(m);
    } catch (e) {
      toast.error("로딩 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const sb = getSupabaseBrowser();
      const { data: profile } = await sb.rpc("get_my_profile");
      setOrgId((profile as Profile | null)?.organization_id ?? null);
      await reload();
    };
    init();
  }, []);

  return (
    <Container size="lg">
      <PageHeader
        title="법인카드 관리"
        description="발급된 법인카드를 등록하고 직원에게 할당합니다. 끝 4자리는 청구 엑셀 업로드 시 자동 매칭됩니다."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">등록된 카드 ({cards.length})</CardTitle>
              <CardDescription>할당된 직원에게는 본인 카드 결제만 표시됩니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : cards.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <CreditCard className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium">아직 등록된 카드가 없습니다</p>
                  <p className="text-xs text-muted-foreground">
                    우측 폼에서 첫 카드를 등록하세요.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {cards.map((c) => (
                    <CardRow
                      key={c.id}
                      card={c}
                      members={members}
                      assignee={c.assigned_to ? memberById.get(c.assigned_to) : undefined}
                      onChanged={reload}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          {orgId && <NewCardForm orgId={orgId} members={members} onCreated={reload} />}
        </div>
      </div>
    </Container>
  );
}

function NewCardForm({
  orgId,
  members,
  onCreated,
}: {
  orgId: string;
  members: Array<{ user_id: string; full_name: string | null; department: string | null }>;
  onCreated: () => void;
}) {
  const [issuer, setIssuer] = useState("신한");
  const [cardName, setCardName] = useState("");
  const [last4, setLast4] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("__none__");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!/^\d{4}$/.test(last4)) {
      toast.error("카드 끝 4자리는 숫자 4자입니다.");
      return;
    }
    setSaving(true);
    try {
      await createCard({
        organization_id: orgId,
        issuer,
        card_name: cardName || null,
        last4,
        assigned_to: assignedTo === "__none__" ? null : assignedTo,
      });
      toast.success("카드가 등록되었습니다.");
      setCardName("");
      setLast4("");
      setAssignedTo("__none__");
      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("duplicate")) {
        toast.error("이미 같은 카드사·끝4자리 조합이 등록되어 있습니다.");
      } else {
        toast.error("등록 실패: " + msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">새 카드 등록</CardTitle>
        <CardDescription>발급받은 법인카드 정보를 입력하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label>카드사</Label>
            <Select value={issuer} onValueChange={setIssuer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUERS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}카드
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-name">카드 별칭 (선택)</Label>
            <Input
              id="card-name"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="예: 영업본부 법인카드 #3"
              maxLength={120}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="last4">카드 끝 4자리 *</Label>
            <Input
              id="last4"
              required
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              className="font-mono tracking-[0.4em]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>할당 직원 (선택)</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— 미할당 —</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.full_name || "이름 미입력"}{m.department ? ` · ${m.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              나중에 행 우측 메뉴에서도 할당할 수 있습니다.
            </p>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={saving} variant="accent">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            카드 등록
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CardRow({
  card,
  members,
  assignee,
  onChanged,
}: {
  card: CorporateCard;
  members: Array<{ user_id: string; full_name: string | null; department: string | null }>;
  assignee?: { full_name: string | null; department: string | null };
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pickValue, setPickValue] = useState<string>(card.assigned_to ?? "__none__");
  const [busy, setBusy] = useState(false);

  const saveAssign = async () => {
    setBusy(true);
    try {
      await updateCard(card.id, {
        assigned_to: pickValue === "__none__" ? null : pickValue,
      });
      toast.success("할당이 변경되었습니다.");
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error("변경 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("이 카드를 삭제할까요? 결제 내역의 매칭이 해제됩니다.")) return;
    setBusy(true);
    try {
      await deleteCard(card.id);
      toast.success("카드가 삭제되었습니다.");
      onChanged();
    } catch (e) {
      toast.error("삭제 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <p className="font-medium">
            {card.issuer}카드 {card.card_name && <span className="text-muted-foreground">· {card.card_name}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{maskCard(card.last4)}</span>
            {card.status !== "active" && (
              <Badge variant="muted" className="ml-2 text-[10px]">
                {card.status}
              </Badge>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Select value={pickValue} onValueChange={setPickValue}>
              <SelectTrigger className="h-9 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— 미할당 —</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.full_name || "이름 미입력"}{m.department ? ` · ${m.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="accent" onClick={saveAssign} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </>
        ) : (
          <>
            {assignee ? (
              <Badge variant="accent">
                {assignee.full_name || "이름 미입력"}{assignee.department ? ` · ${assignee.department}` : ""}
              </Badge>
            ) : (
              <Badge variant="muted">미할당</Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {assignee ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              할당 변경
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
