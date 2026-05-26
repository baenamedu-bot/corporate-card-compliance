"use client";

import { useState } from "react";
import { Info, ExternalLink, Mail, GraduationCap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BRAND, APP } from "./brand-constants";

export function CreatorInfoModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="앱 정보"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{APP.name}</DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-wider text-muted-foreground">
            {APP.tagline}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm leading-relaxed text-foreground/90">
              이 앱은{" "}
              <span className="font-semibold text-foreground">{BRAND.studio}</span>의
              AI 교육 프로그램에서 제작되었습니다.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <GraduationCap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{BRAND.creator}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {BRAND.creatorTitle}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">AI 교육 · 강연 · 맞춤 앱 제작 문의 환영</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  실무에서 바로 쓰는 AI 도구를 함께 만들어 드립니다
                </p>
              </div>
            </div>
          </div>

          <Button asChild size="lg" className="w-full" variant="accent">
            <a
              href={BRAND.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              홈페이지 방문 → {BRAND.websiteLabel}
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
