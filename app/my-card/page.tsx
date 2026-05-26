"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  Inbox,
  BellRing,
  AlertOctagon,
  CalendarClock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Container, PageHeader } from "@/components/layout/container";
import { Card, CardContent } from "@/components/ui/card";
import {
  listMyCards,
  listSettlements,
  listTransactions,
} from "@/lib/db/transactions";
import { dbSettlementToClient, dbTxnToClient } from "@/lib/db/adapters";
import {
  daysSince,
  formatKRW,
  maskCard,
  SETTLEMENT_URGENT_DAYS,
} from "@/lib/format";
import { amountTier, isSettled } from "@/lib/risk-rules";
import { TransactionItem } from "@/components/my-card/transaction-item";
import type { CorporateCard } from "@/lib/supabase/types";
import type { Settlement, Transaction } from "@/lib/types";

export default function MyCardPage() {
  const [loading, setLoading] = useState(true);
  const [myCards, setMyCards] = useState<CorporateCard[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, dbTxns] = await Promise.all([listMyCards(), listTransactions({ limit: 500 })]);
      setMyCards(cards);
      const list = dbTxns
        .map((t) => dbTxnToClient(t))
        .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
      setTxns(list);
      if (list.length) {
        const s = await listSettlements(list.map((t) => t.id));
        setSettlements(s.map(dbSettlementToClient));
      } else {
        setSettlements([]);
      }
    } catch (e) {
      toast.error("로딩 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const settledMap = useMemo(
    () => new Map(settlements.map((s) => [s.transactionId, s])),
    [settlements],
  );

  const stats = useMemo(() => {
    const total = txns.reduce((s, t) => s + t.amount, 0);
    const pendingTxns = txns.filter((t) => !isSettled(settledMap.get(t.id)));
    const pending = pendingTxns.length;
    const tier3 = txns.filter((t) => amountTier(t.amount) === 3).length;
    const oldestDays = pendingTxns.length
      ? Math.max(...pendingTxns.map((t) => daysSince(t.paidAt)))
      : 0;
    const urgentCount = pendingTxns.filter(
      (t) => daysSince(t.paidAt) >= SETTLEMENT_URGENT_DAYS,
    ).length;
    return { total, pending, tier3, count: txns.length, oldestDays, urgentCount };
  }, [txns, settledMap]);

  if (loading) {
    return (
      <Container size="lg">
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          본인 내역을 불러오는 중...
        </div>
      </Container>
    );
  }

  if (myCards.length === 0) {
    return (
      <Container size="lg">
        <PageHeader title="본인 카드 내역" description="할당된 법인카드의 결제 내역이 표시됩니다." />
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">할당된 카드가 없습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">
                관리자에게 본인 카드 할당을 요청해주세요. 할당되면 본인 결제만 자동으로 표시됩니다.
              </p>
            </div>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <PageHeader
        title="본인 카드 내역"
        description={`할당된 카드 ${myCards.length}장의 결제만 표시됩니다. 다른 사용자의 내역은 일절 노출되지 않습니다.`}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {myCards.map((c) => (
          <div
            key={c.id}
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs shadow-sm"
          >
            <CreditCard className="h-3.5 w-3.5 text-accent" />
            <span className="font-medium">{c.issuer}카드</span>
            {c.card_name && <span className="text-muted-foreground">· {c.card_name}</span>}
            <span className="font-mono text-muted-foreground">{maskCard(c.last4)}</span>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="누적 결제" value={formatKRW(stats.total)} />
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

      {txns.length > 0 && stats.pending > 0 && (
        <PendingBanner
          pendingCount={stats.pending}
          oldestDays={stats.oldestDays}
          urgentCount={stats.urgentCount}
        />
      )}

      {txns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">표시할 결제 내역이 없습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">
                경리/재무팀이 본인 카드 번호의 청구 엑셀을 업로드하면 자동으로 표시됩니다.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {txns.map((t) => (
            <TransactionItem
              key={t.id}
              txn={t}
              settlement={settledMap.get(t.id)}
              onSaved={reload}
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
  const cls = isUrgent ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50";
  const iconCls = isUrgent ? "text-red-600" : "text-amber-600";
  const headingCls = isUrgent ? "text-red-900" : "text-amber-900";
  const subCls = isUrgent ? "text-red-700" : "text-amber-800";

  return (
    <div
      role="alert"
      className={`mb-6 flex flex-col gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${cls}`}
    >
      <div className="flex items-start gap-3">
        <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ${iconCls}`}>
          {isUrgent ? <AlertOctagon className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </div>
        <div className="space-y-1">
          <p className={`text-sm font-semibold ${headingCls}`}>
            미입력 <span className="tabular-nums">{pendingCount}</span>건
            {oldestDays > 0 && (
              <>
                {" · "}가장 오래된 건 <span className="tabular-nums">{oldestDays}일</span> 경과
              </>
            )}
          </p>
          <p className={`text-xs leading-relaxed ${subCls}`}>
            {isUrgent ? (
              <>
                <strong>{SETTLEMENT_URGENT_DAYS}일 이상 경과 {urgentCount}건</strong>이 있습니다. 즉시 [참석자·목적]을 입력해 정산을 마무리해주세요.
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
            (tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "")
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
