import Link from "next/link";
import {
  Upload,
  CreditCard,
  LayoutDashboard,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";

const ROLES = [
  {
    href: "/upload",
    icon: Upload,
    role: "경리 · 재무",
    title: "카드사 청구 엑셀 업로드",
    desc: "신한·삼성·국민·현대 등 양식 그대로 업로드. AI가 컬럼을 자동 매핑해 표준 스키마로 통일합니다.",
    accent: "엑셀 자동 표준화",
  },
  {
    href: "/my-card",
    icon: CreditCard,
    role: "영업 담당자",
    title: "본인 카드 내역 · 주 1회 정산",
    desc: "카드 끝 4자리로 본인 결제만 격리 조회. 참석자·목적 두 항목만 입력해 정산을 끝냅니다.",
    accent: "본인 내역 격리 조회",
  },
  {
    href: "/admin",
    icon: LayoutDashboard,
    role: "준법감시 · 경영지원",
    title: "전사 모니터링 · 위험 결제",
    desc: "부서별·개인별 지출 비교, 미입력 현황, AI 기반 유흥업종·심야결제 위험 자동 탐지.",
    accent: "컴플라이언스 대시보드",
  },
  {
    href: "/reports",
    icon: FileSpreadsheet,
    role: "전 부서",
    title: "주간 · 월간 사용보고서",
    desc: "기간별 지출, 부서·개인 순위, 컴플라이언스 리스크, 미입력자 명단 — 화면 + 엑셀 내보내기.",
    accent: "엑셀 내보내기 포함",
  },
] as const;

export default function HomePage() {
  return (
    <Container size="lg">
      <section className="mb-12 max-w-3xl">
        <Badge variant="accent" className="mb-4">
          <Sparkles className="mr-1.5 h-3 w-3" />
          AI 기반 컴플라이언스 자동화
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          법인카드 지출, <br className="hidden sm:inline" />
          통제와 정산을 한 화면에서.
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          자산운용사·금융사를 위한 법인카드 컴플라이언스 모니터링 시스템.
          카드사별 청구 엑셀을 AI가 표준화하고, 영업 담당자는 본인 내역만 확인해
          참석자·목적 두 항목으로 정산을 끝냅니다.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="결제 표준화" value="자동" />
          <Stat label="본인 내역 격리" value="끝 4자리" />
          <Stat label="금액 구간 통제" value="3단계" />
          <Stat label="위험 자동 탐지" value="실시간" />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.href}
              href={r.href}
              className="group relative rounded-xl border border-border/70 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent" />
              </div>
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  {r.role}
                </p>
                <h3 className="mt-1 text-base font-semibold tracking-tight">
                  {r.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {r.desc}
                </p>
              </div>
              <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                <ShieldCheck className="h-3.5 w-3.5" />
                {r.accent}
              </div>
            </Link>
          );
        })}
      </div>
    </Container>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
