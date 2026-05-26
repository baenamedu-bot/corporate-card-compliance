"use client";

import { useMemo, useState } from "react";
import { Download, Calendar, ShieldAlert, Users, AlertCircle } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  getRisks,
  getSettlements,
  getTransactions,
} from "@/lib/storage";
import { formatKRW, formatDate, maskCard, monthRange, weekRange } from "@/lib/format";
import { exportTransactionsXlsx } from "@/lib/excel-utils";
import { isSettled, riskLevelLabel, riskLevelClass } from "@/lib/risk-rules";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

type Period = "week" | "month";

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("week");

  const range = useMemo(() => (period === "week" ? weekRange() : monthRange()), [period]);

  const txns = useMemo(() => getTransactions(), []);
  const settlements = useMemo(() => getSettlements(), []);
  const risks = useMemo(() => getRisks(), []);
  const sMap = useMemo(() => new Map(settlements.map((s) => [s.transactionId, s])), [settlements]);
  const rMap = useMemo(() => new Map(risks.map((r) => [r.transactionId, r])), [risks]);

  const inPeriod = useMemo(() => {
    return txns.filter((t) => {
      const d = new Date(t.paidAt);
      return d >= range.start && d < range.end;
    });
  }, [txns, range]);

  const stats = useMemo(() => {
    const total = inPeriod.reduce((s, t) => s + t.amount, 0);
    const pending = inPeriod.filter((t) => !isSettled(sMap.get(t.id))).length;
    const critical = inPeriod.filter((t) => rMap.get(t.id)?.level === "critical").length;
    const high = inPeriod.filter((t) => rMap.get(t.id)?.level === "high").length;
    return { total, pending, critical, high, count: inPeriod.length };
  }, [inPeriod, sMap, rMap]);

  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    inPeriod.forEach((t) => {
      const k = t.department || "미지정";
      m.set(k, (m.get(k) || 0) + t.amount);
    });
    return Array.from(m.entries())
      .map(([dept, amount]) => ({ dept, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [inPeriod]);

  const byPerson = useMemo(() => {
    const m = new Map<string, { name: string; last4: string; dept: string; amount: number; count: number }>();
    inPeriod.forEach((t) => {
      const cur = m.get(t.cardLast4) || {
        name: t.cardholderName || "익명",
        last4: t.cardLast4,
        dept: t.department || "미지정",
        amount: 0,
        count: 0,
      };
      cur.amount += t.amount;
      cur.count += 1;
      m.set(t.cardLast4, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount);
  }, [inPeriod]);

  const pendingPeople = useMemo(() => {
    const m = new Map<string, { name: string; last4: string; dept: string; pending: number }>();
    inPeriod.forEach((t) => {
      if (isSettled(sMap.get(t.id))) return;
      const cur = m.get(t.cardLast4) || {
        name: t.cardholderName || "익명",
        last4: t.cardLast4,
        dept: t.department || "미지정",
        pending: 0,
      };
      cur.pending += 1;
      m.set(t.cardLast4, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.pending - a.pending);
  }, [inPeriod, sMap]);

  const riskList = useMemo(() => {
    return inPeriod
      .map((t) => ({ t, r: rMap.get(t.id) }))
      .filter((x) => x.r && (x.r.level === "high" || x.r.level === "critical"))
      .sort((a, b) => new Date(b.t.paidAt).getTime() - new Date(a.t.paidAt).getTime());
  }, [inPeriod, rMap]);

  const onExport = () => {
    if (inPeriod.length === 0) {
      toast.message("내보낼 데이터가 없습니다.");
      return;
    }
    const label =
      period === "week"
        ? `주간(${formatDate(range.start.toISOString())})`
        : `월간(${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")})`;
    exportTransactionsXlsx({
      fileName: `법인카드_${label}_보고서.xlsx`,
      txns: inPeriod,
      settlements,
      risks,
    });
    toast.success(`${inPeriod.length}건이 포함된 보고서가 다운로드되었습니다.`);
  };

  const rangeLabel =
    period === "week"
      ? `${formatDate(range.start.toISOString())} ~ ${formatDate(
          new Date(range.end.getTime() - 1).toISOString(),
        )}`
      : `${range.start.getFullYear()}년 ${range.start.getMonth() + 1}월`;

  return (
    <Container size="lg">
      <PageHeader
        title="주간 · 월간 사용보고서"
        description="기간별 지출 합계, 부서·개인별 순위, 컴플라이언스 리스크, 미입력자 명단을 한 화면에서 보고 엑셀로 내보냅니다."
        actions={
          <Button onClick={onExport} variant="accent">
            <Download className="h-4 w-4" />
            엑셀로 내보내기
          </Button>
        }
      />

      <div className="mb-6 flex items-center justify-between gap-3">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="week">주간</TabsTrigger>
            <TabsTrigger value="month">월간</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium tabular-nums">{rangeLabel}</span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Kpi label="기간 합계" value={formatKRW(stats.total)} />
        <Kpi label="결제 건수" value={`${stats.count}건`} />
        <Kpi label="미정산" value={`${stats.pending}건`} tone={stats.pending > 0 ? "amber" : undefined} />
        <Kpi
          label="위험/경고"
          value={`${stats.critical + stats.high}건`}
          tone={stats.critical > 0 ? "red" : stats.high > 0 ? "amber" : undefined}
        />
      </div>

      {inPeriod.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">해당 기간의 결제 내역이 없습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {period === "week" ? "이번 주" : "이번 달"} 결제가 없거나, 청구 엑셀이 아직 업로드되지 않았습니다.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">부서별 지출</CardTitle>
              <CardDescription>{rangeLabel} 기준</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={byDept} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis
                      dataKey="dept"
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e4e4e7" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`
                      }
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      formatter={(v: number) => [formatKRW(v), "지출"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }}
                    />
                    <Bar dataKey="amount" fill="#1e3a8a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">미정산자 명단</CardTitle>
              <CardDescription>참석자·목적 미입력자</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPeople.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  미정산자가 없습니다. 모든 결제가 정산 완료되었습니다.
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {pendingPeople.map((p) => (
                    <div key={p.last4} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{maskCard(p.last4)}</span> · {p.dept}
                        </p>
                      </div>
                      <Badge variant="amber">{p.pending}건</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">개인별 지출 순위</CardTitle>
              <CardDescription>{rangeLabel} 기준 / 카드 끝 4자리</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/60">
                {byPerson.map((p, i) => (
                  <div key={p.last4} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{maskCard(p.last4)}</span> · {p.dept} · {p.count}건
                        </p>
                      </div>
                    </div>
                    <span className="tabular-nums font-semibold">{formatKRW(p.amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">컴플라이언스 리스크 요약</CardTitle>
              <CardDescription>경고/위험 건수</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <SummaryRow icon={ShieldAlert} label="위험 (critical)" value={stats.critical} tone="red" />
              <SummaryRow icon={AlertCircle} label="경고 (high)" value={stats.high} tone="amber" />
              <SummaryRow icon={Users} label="미정산 건" value={stats.pending} tone="amber" />
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-sm">기간 내 위험 결제 상세</CardTitle>
              <CardDescription>경고/위험 등급 결제</CardDescription>
            </CardHeader>
            <CardContent>
              {riskList.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  해당 기간에 경고/위험 등급 결제가 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {riskList.map(({ t, r }) => (
                    <div
                      key={t.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-sm">{t.merchantName}</p>
                          <span
                            className={
                              "inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-medium " +
                              riskLevelClass(r!.level)
                            }
                          >
                            {riskLevelLabel(r!.level)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(t.paidAt)} · {t.cardCompany}카드{" "}
                          <span className="font-mono">{maskCard(t.cardLast4)}</span>
                          {t.cardholderName && ` · ${t.cardholderName}`}
                          {r!.reasons[0] && ` · ${r!.reasons[0]}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatKRW(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Container>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "red";
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={
            "mt-1.5 text-lg font-semibold tabular-nums " +
            (tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "")
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "amber" | "red";
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
      <div className="inline-flex items-center gap-2">
        <Icon
          className={
            "h-4 w-4 " +
            (tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : "text-muted-foreground")
          }
        />
        <span className="text-sm">{label}</span>
      </div>
      <span
        className={
          "tabular-nums text-sm font-semibold " +
          (tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "")
        }
      >
        {value}건
      </span>
    </div>
  );
}
