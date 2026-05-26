"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  Lock,
  LogOut,
  ArrowRight,
  ShieldAlert,
  Inbox,
  BellRing,
  AlertOctagon,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { Container, PageHeader } from "@/components/layout/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  clearCurrentCardLast4,
  getCurrentCardLast4,
  getSettlements,
  getTransactions,
  setCurrentCardLast4,
} from "@/lib/storage";
import { daysSince, formatKRW, maskCard, SETTLEMENT_URGENT_DAYS } from "@/lib/format";
import { amountTier, isSettled } from "@/lib/risk-rules";
import { TransactionItem } from "@/components/my-card/transaction-item";

export default function MyCardPage() {
  const [last4, setLast4] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLast4(getCurrentCardLast4());
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  if (!last4) {
    return (
      <CardEntry
        onEnter={(v) => {
          setCurrentCardLast4(v);
          setLast4(v);
        }}
      />
    );
  }

  return (
    <MyTransactions
      last4={last4}
      onExit={() => {
        clearCurrentCardLast4();
        setLast4(null);
      }}
      refreshKey={refreshKey}
      onChange={() => setRefreshKey((k) => k + 1)}
    />
  );
}

/* ---------- 카드 4자리 진입 ---------- */
function CardEntry({ onEnter }: { onEnter: (last4: string) => void }) {
  const [value, setValue] = useState("");

  const ok = /^\d{4}$/.test(value);
  const allLast4 = useMemo(() => {
    const set = new Set<string>();
    getTransactions().forEach((t) => set.add(t.cardLast4));
    return Array.from(set);
  }, []);

  const enter = () => {
    if (!ok) {
      toast.error("카드번호 끝 4자리(숫자 4자)를 입력해주세요.");
      return;
    }
    onEnter(value);
  };

  return (
    <Container size="sm">
      <div className="mx-auto mt-8 max-w-md">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          본인 내역만 표시
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          본인 카드 번호로 진입
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          카드번호 끝 <strong className="text-foreground">4자리</strong>를 입력하면 본인 결제
          내역만 표시됩니다. 다른 사용자 내역은 일절 노출되지 않습니다.
        </p>

        <Card className="mt-6">
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-2">
              <Label htmlFor="last4">카드번호 끝 4자리</Label>
              <div className="relative">
                <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="last4"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="예: 1234"
                  className="pl-9 font-mono text-base tracking-[0.4em]"
                  onKeyDown={(e) => e.key === "Enter" && enter()}
                  autoFocus
                />
              </div>
            </div>
            <Button onClick={enter} size="lg" className="w-full" disabled={!ok} variant="accent">
              본인 내역 확인하기
              <ArrowRight className="h-4 w-4" />
            </Button>
            {allLast4.length > 0 && (
              <div className="border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <p className="mb-2">업로드된 카드 끝 4자리 목록 (테스트용)</p>
                <div className="flex flex-wrap gap-1.5">
                  {allLast4.slice(0, 16).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setValue(l)}
                      className="rounded-md border border-border/60 bg-background px-2 py-0.5 font-mono hover:border-accent hover:text-accent"
                    >
                      ****{l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}

/* ---------- 본인 내역 + 정산 ---------- */
function MyTransactions({
  last4,
  onExit,
  refreshKey,
  onChange,
}: {
  last4: string;
  onExit: () => void;
  refreshKey: number;
  onChange: () => void;
}) {
  const allTxns = useMemo(() => getTransactions(), [refreshKey]);
  const myTxns = useMemo(
    () => allTxns.filter((t) => t.cardLast4 === last4)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()),
    [allTxns, last4],
  );
  const settlements = useMemo(() => getSettlements(), [refreshKey]);
  const settledMap = useMemo(() => {
    const m = new Map(settlements.map((s) => [s.transactionId, s]));
    return m;
  }, [settlements]);

  const stats = useMemo(() => {
    const total = myTxns.reduce((s, t) => s + t.amount, 0);
    const pendingTxns = myTxns.filter((t) => !isSettled(settledMap.get(t.id)));
    const pending = pendingTxns.length;
    const tier3 = myTxns.filter((t) => amountTier(t.amount) === 3).length;
    const oldestDays = pendingTxns.length
      ? Math.max(...pendingTxns.map((t) => daysSince(t.paidAt)))
      : 0;
    const urgentCount = pendingTxns.filter(
      (t) => daysSince(t.paidAt) >= SETTLEMENT_URGENT_DAYS,
    ).length;
    return {
      total,
      pending,
      tier3,
      count: myTxns.length,
      oldestDays,
      urgentCount,
    };
  }, [myTxns, settledMap]);

  const owner = myTxns[0]?.cardholderName;

  return (
    <Container size="lg">
      <PageHeader
        title={`본인 카드 내역 · ${maskCard(last4)}`}
        description={
          owner
            ? `${owner} 님의 결제 내역만 표시됩니다.`
            : "본인 카드 끝 4자리에 해당하는 결제만 표시됩니다."
        }
        actions={
          <Button variant="outline" size="sm" onClick={onExit}>
            <LogOut className="h-4 w-4" />
            진입 해제
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="이번 카드 누적" value={formatKRW(stats.total)} />
        <StatCard label="결제 건수" value={`${stats.count}건`} />
        <StatCard
          label="미정산 건"
          value={`${stats.pending}건`}
          tone={stats.pending > 0 ? "amber" : "default"}
        />
        <StatCard
          label="최고 위험 (200만↑)"
          value={`${stats.tier3}건`}
          tone={stats.tier3 > 0 ? "red" : "default"}
        />
      </div>

      {/* 미정산 리마인더 배너 (urgent 우선, 그 다음 일반 미정산) */}
      {myTxns.length > 0 && stats.pending > 0 && (
        <PendingBanner
          pendingCount={stats.pending}
          oldestDays={stats.oldestDays}
          urgentCount={stats.urgentCount}
        />
      )}

      {myTxns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">표시할 결제 내역이 없습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">
                경리/재무팀이 해당 카드 번호의 청구 엑셀을 업로드하면 자동으로 표시됩니다.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {myTxns.map((t) => (
            <TransactionItem
              key={t.id}
              txn={t}
              settlement={settledMap.get(t.id)}
              onSaved={onChange}
            />
          ))}
        </div>
      )}
    </Container>
  );
}

function PendingBanner({
  pendingCount,
  oldestDays,
  urgentCount,
}: {
  pendingCount: number;
  oldestDays: number;
  urgentCount: number;
}) {
  const isUrgent = urgentCount > 0;
  const cls = isUrgent
    ? "border-red-300 bg-red-50"
    : "border-amber-300 bg-amber-50";
  const iconCls = isUrgent ? "text-red-600" : "text-amber-600";
  const headingCls = isUrgent ? "text-red-900" : "text-amber-900";
  const subCls = isUrgent ? "text-red-700" : "text-amber-800";

  return (
    <div
      role="alert"
      className={`mb-6 flex flex-col gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${cls}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ${iconCls}`}
        >
          {isUrgent ? <AlertOctagon className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </div>
        <div className="space-y-1">
          <p className={`text-sm font-semibold ${headingCls}`}>
            미입력 <span className="tabular-nums">{pendingCount}</span>건
            {oldestDays > 0 && (
              <>
                {" · "}
                가장 오래된 건 <span className="tabular-nums">{oldestDays}일</span> 경과
              </>
            )}
          </p>
          <p className={`text-xs leading-relaxed ${subCls}`}>
            {isUrgent ? (
              <>
                <strong>{SETTLEMENT_URGENT_DAYS}일 이상 경과 {urgentCount}건</strong>이
                있습니다. 즉시 [참석자·목적]을 입력해 정산을 마무리해주세요.
              </>
            ) : (
              <>주 1회 [참석자·목적] 입력으로 정산을 마무리해주세요.</>
            )}
          </p>
        </div>
      </div>
      {isUrgent && (
        <span className="inline-flex items-center gap-1.5 self-start rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 sm:self-center">
          <CalendarClock className="h-3.5 w-3.5" />
          긴급 {urgentCount}건
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "red";
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={
            "text-lg font-semibold tabular-nums " +
            (tone === "amber"
              ? "text-amber-700"
              : tone === "red"
                ? "text-red-700"
                : "")
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
