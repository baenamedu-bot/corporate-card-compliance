"use client";

import { useEffect, useState } from "react";
import { Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BRAND, APP } from "./brand-constants";

const KEY = "welcome_shown";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shown = window.localStorage.getItem(KEY);
    if (!shown) {
      const t = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  const close = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, "1");
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-md">
        <div className="-mx-6 -mt-6 mb-2 flex items-center gap-2 rounded-t-2xl border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent px-6 py-4">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              {BRAND.studio}의 AI 교육에서 만든 앱
            </p>
          </div>
        </div>

        <DialogHeader>
          <DialogTitle className="text-xl">
            {APP.name} 시스템에 오신 것을 환영합니다
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            카드사 청구 엑셀을 표준화하고, 영업 담당자의 정산 입력과 컴플라이언스
            모니터링을 한 곳에서 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <Feature title="AI 자동 컬럼 매핑" desc="신한·삼성·국민·현대 양식 그대로 업로드 → Gemini가 표준화" />
          <Feature title="본인 카드 격리 조회" desc="영업 담당자는 본인 카드 끝 4자리로 본인 결제만 확인" />
          <Feature title="금액 구간 자동 통제" desc="50/100/200만원 구간별 사전 승인·결재문서 번호 룰 적용" />
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          제작 <span className="font-medium text-foreground">{BRAND.creator}</span>{" "}
          ·{" "}
          <a
            href={BRAND.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            {BRAND.websiteLabel}
          </a>
          {" — "}AI 교육·강연·맞춤 앱 제작 문의 환영
        </div>

        <Button onClick={close} size="lg" className="w-full" variant="accent">
          시작하기
          <ArrowRight className="h-4 w-4" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
