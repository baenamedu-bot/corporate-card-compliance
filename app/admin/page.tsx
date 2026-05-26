"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ShieldAlert,
  Sparkles,
  Loader2,
  AlertCircle,
  TrendingUp,
  Users,
  ClipboardList,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Container, PageHeader } from "@/components/layout/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  saveRisks,
} from "@/lib/storage";
import {
  amountTier,
  isSettled,
  riskBarClass,
  riskLevelClass,
  riskLevelLabel,
  ruleBasedRisk,
  tierLabel,
} from "@/lib/risk-rules";
import type { RiskAssessment, RiskLevel, Transaction } from "@/lib/types";
import { formatKRW, formatDateTime, maskCard } from "@/lib/format";
import { analyzeRiskBatch } from "@/lib/ai-risk";
import { MissingApiKeyError } from "@/lib/gemini-client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "#a1a1aa",
  medium: "#facc15",
  high: "#f59e0b",
  critical: "#dc2626",
};

export default function AdminPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTier, setActiveTier] = useState<"all" | 1 | 2 | 3>("all");

  const txns = useMemo(() => getTransactions(), [refreshKey]);
  const settlements = useMemo(() => getSettlements(), [refreshKey]);
  const settledMap = useMemo(
    () => new Map(settlements.map((s) => [s.transactionId, s])),
    [settlements],
  );
  const risks = useMemo(() => getRisks(), [refreshKey]);
  const riskMap = useMemo(
    () => new Map(risks.map((r) => [r.transactionId, r])),
    [risks],
  );

  // 누락된 위험 평가 자동 채움 (룰 베이스)
  useEffect(() => {
    if (!txns.length) return;
    const existing = new Set(risks.map((r) => r.transactionId));
    const missing = txns.filter((t) => !existing.has(t.id));
    if (missing.length) {
      const next = [...risks, ...missing.map((t) => ruleBasedRisk(t))];
      saveRisks(next);
      setRefreshKey((k) => k + 1);
    }
  }, [txns, risks]);

  /* ---------- 통계 ---------- */
  const stats = useMemo(() => {
    const total = txns.reduce((s, t) => s + t.amount, 0);
    const pending = txns.filter((t) => !isSettled(settledMap.get(t.id))).length;
    const critical = risks.filter((r) => r.level === "critical").length;
    const high = risks.filter((r) => r.level === "high").length;
    return { total, pending, critical, high, count: txns.length };
  }, [txns, risks, settledMap]);

  /* ---------- 부서/개인 별 합계 ---------- */
  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    txns.forEach((t) => {
      const k = t.department || "미지정";
      m.set(k, (m.get(k) || 0) + t.amount);
    });
    return Array.from(m.entries())
      .map(([dept, amount]) => ({ dept, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [txns]);

  const byPerson = useMemo(() => {
    const m = new Map<string, { name: string; last4: string; amount: number; count: number }>();
    txns.forEach((t) => {
      const key = t.cardLast4;
      const cur = m.get(key) || {
        name: t.cardholderName || "익명",
        last4: t.cardLast4,
        amount: 0,
        count: 0,
      };
      cur.amount += t.amount;
      cur.count += 1;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [txns]);

  /* ---------- 미입력자 ---------- */
  const pendingByPerson = useMemo(() => {
    const m = new Map<string, { name: string; last4: string; pending: number }>();
    txns.forEach((t) => {
      if (isSettled(settledMap.get(t.id))) return;
      const key = t.cardLast4;
      const cur = m.get(key) || {
        name: t.cardholderName || "익명",
        last4: t.cardLast4,
        pending: 0,
      };
      cur.pending += 1;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.pending - a.pending);
  }, [txns, settledMap]);

  /* ---------- 위험 분포 ---------- */
  const riskDist = useMemo(() => {
    const counts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    risks.forEach((r) => counts[r.level]++);
    return (["critical", "high", "medium", "low"] as RiskLevel[]).map((l) => ({
      level: riskLevelLabel(l),
      value: counts[l],
      color: RISK_COLOR[l],
    }));
  }, [risks]);

  /* ---------- 위험 결제 리스트 ---------- */
  const riskyTxns = useMemo(() => {
    let list = txns
      .map((t) => ({ t, r: riskMap.get(t.id) }))
      .filter((x) => x.r && (x.r.level === "critical" || x.r.level === "high"))
      .sort(
        (a, b) => new Date(b.t.paidAt).getTime() - new Date(a.t.paidAt).getTime(),
      );
    if (activeTier !== "all") {
      list = list.filter((x) => amountTier(x.t.amount) === activeTier);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (x) =>
          x.t.merchantName.toLowerCase().includes(q) ||
          (x.t.cardholderName || "").toLowerCase().includes(q) ||
          x.t.cardLast4.includes(q),
      );
    }
    return list.slice(0, 30);
  }, [txns, riskMap, activeTier, query]);

  /* ---------- AI 위험 분석 ---------- */
  const runAi = async () => {
    if (!txns.length) {
      toast.message("분석할 결제 내역이 없습니다.");
      return;
    }
    setAnalyzing(true);
    try {
      const targets = txns.filter((t) => {
        const r = riskMap.get(t.id);
        return !r || !r.aiAnalyzed;
      });
      if (!targets.length) {
        toast.message("이미 모든 결제가 AI로 분석되었습니다.");
        return;
      }
      // 25건 단위 배치
      const next: RiskAssessment[] = [...risks];
      const chunk = 25;
      for (let i = 0; i < targets.length; i += chunk) {
        const slice = targets.slice(i, i + chunk);
        const ai = await analyzeRiskBatch(slice);
        slice.forEach((t) => {
          const aiItem = ai.find((a) => a.id === t.id);
          const baseRule = ruleBasedRisk(t);
          const reasons = aiItem
            ? Array.from(new Set([...baseRule.reasons, ...aiItem.reasons]))
            : baseRule.reasons;
          const level =
            aiItem && severity(aiItem.level) > severity(baseRule.level)
              ? aiItem.level
              : baseRule.level;
          const idx = next.findIndex((r) => r.transactionId === t.id);
          const merged: RiskAssessment = {
            transactionId: t.id,
            level,
            reasons,
            amountTier: amountTier(t.amount),
            assessedAt: new Date().toISOString(),
            aiAnalyzed: true,
          };
          if (idx >= 0) next[idx] = merged;
          else next.push(merged);
        });
        saveRisks(next);
        setRefreshKey((k) => k + 1);
      }
      toast.success(`${targets.length}건의 AI 위험 분석이 완료되었습니다.`);
    } catch (e) {
      if (e instanceof MissingApiKeyError) {
        toast.message("Gemini API 키가 필요합니다. 우측 상단 ⚙️ 버튼에서 설정해주세요.");
      } else {
        toast.error("AI 분석 실패: " + (e instanceof Error ? e.message : "알 수 없음"));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Container size="lg">
      <PageHeader
        title="컴플라이언스 대시보드"
        description="전사 결제 모니터링, 위험 결제 자동 탐지, 미정산 현황을 한 곳에서 관리하세요."
        actions={
          <Button onClick={runAi} disabled={analyzing} variant="accent">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? "AI 분석 중..." : "AI 위험 분석 실행"}
          </Button>
        }
      />

      {/* KPI */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="총 결제액" value={formatKRW(stats.total)} icon={TrendingUp} />
        <Kpi label="총 결제 건수" value={`${stats.count.toLocaleString()}건`} icon={ClipboardList} />
        <Kpi
          label="미정산"
          value={`${stats.pending}건`}
          icon={Users}
          tone={stats.pending > 0 ? "amber" : undefined}
        />
        <Kpi
          label="경고"
          value={`${stats.high}건`}
          icon={AlertCircle}
          tone={stats.high > 0 ? "amber" : undefined}
        />
        <Kpi
          label="위험"
          value={`${stats.critical}건`}
          icon={ShieldAlert}
          tone={stats.critical > 0 ? "red" : undefined}
        />
      </div>

      {/* 차트 */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">부서별 지출</CardTitle>
            <CardDescription>상위 8개 부서</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {byDept.length === 0 ? (
                <EmptyChart />
              ) : (
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
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e4e4e7",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="amount" fill="#1e3a8a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">위험 등급 분포</CardTitle>
            <CardDescription>전체 결제 기준</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {risks.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={riskDist.filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="level"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {riskDist.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e4e4e7",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {riskDist.map((d) => (
                <div key={d.level} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.level}</span>
                  <span className="ml-auto tabular-nums font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="risks">
        <TabsList>
          <TabsTrigger value="risks">위험 결제</TabsTrigger>
          <TabsTrigger value="pending">미정산자 현황</TabsTrigger>
          <TabsTrigger value="rank">개인별 순위</TabsTrigger>
        </TabsList>

        <TabsContent value="risks">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-sm">위험 결제 모니터링</CardTitle>
                  <CardDescription>
                    경고/위험 등급 결제 상위 30건 — AI 분석 실행 시 더 정교해집니다.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="가맹점/사용자/카드 4자리"
                      className="h-9 w-56 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex rounded-md border border-border/70 p-0.5">
                    {(["all", 1, 2, 3] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTier(t)}
                        className={
                          "rounded-sm px-2 py-1 text-xs transition-colors " +
                          (activeTier === t
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {t === "all" ? "전체" : tierLabel(t)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {riskyTxns.length === 0 ? (
                <EmptyState
                  icon={ShieldAlert}
                  title="표시할 위험 결제가 없습니다"
                  desc="결제가 업로드되면 자동으로 위험도가 평가됩니다."
                />
              ) : (
                <div className="space-y-2">
                  {riskyTxns.map(({ t, r }) => (
                    <RiskRow key={t.id} txn={t} risk={r!} settled={isSettled(settledMap.get(t.id))} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">미정산자 현황</CardTitle>
              <CardDescription>참석자·목적 미입력 건수 기준</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingByPerson.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="모든 결제가 정산되었습니다"
                  desc="참석자·목적이 모두 입력되어 있습니다."
                />
              ) : (
                <div className="divide-y divide-border/60">
                  {pendingByPerson.map((p) => (
                    <div
                      key={p.last4}
                      className="flex items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                          <Users className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {maskCard(p.last4)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="amber">미정산 {p.pending}건</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rank">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">개인별 지출 순위</CardTitle>
              <CardDescription>카드 끝 4자리 기준 합계 상위 10명</CardDescription>
            </CardHeader>
            <CardContent>
              {byPerson.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="데이터가 없습니다"
                  desc="결제 내역을 업로드해주세요."
                />
              ) : (
                <div className="divide-y divide-border/60">
                  {byPerson.map((p, i) => (
                    <div
                      key={p.last4}
                      className="flex items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted font-semibold tabular-nums">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {maskCard(p.last4)} · {p.count}건
                          </p>
                        </div>
                      </div>
                      <span className="tabular-nums font-semibold">{formatKRW(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Container>
  );
}

function severity(l: RiskLevel): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[l];
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "amber" | "red";
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <Icon
            className={
              "h-4 w-4 " +
              (tone === "amber"
                ? "text-amber-600"
                : tone === "red"
                  ? "text-red-600"
                  : "text-muted-foreground")
            }
          />
        </div>
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

function RiskRow({ txn, risk, settled }: { txn: Transaction; risk: RiskAssessment; settled: boolean }) {
  return (
    <div className={"rounded-lg border border-border/60 px-4 py-3 " + riskBarClass(risk.level)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{txn.merchantName}</p>
            <span className={"inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-medium " + riskLevelClass(risk.level)}>
              {riskLevelLabel(risk.level)}
            </span>
            {risk.aiAnalyzed && (
              <Badge variant="accent" className="text-[10px]">
                <Sparkles className="h-2.5 w-2.5" />AI
              </Badge>
            )}
            {!settled && <Badge variant="amber" className="text-[10px]">미정산</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(txn.paidAt)} · {txn.cardCompany}카드{" "}
            <span className="font-mono">{maskCard(txn.cardLast4)}</span>
            {txn.cardholderName && ` · ${txn.cardholderName}`}
            {txn.department && ` · ${txn.department}`}
          </p>
          {risk.reasons.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {risk.reasons.map((r, i) => (
                <span key={i} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatKRW(txn.amount)}</span>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      데이터가 없습니다
    </div>
  );
}
