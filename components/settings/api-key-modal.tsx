"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink, KeyRound, Settings2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  API_KEY_OPEN_EVENT,
  clearApiKey,
  getApiKey,
  setApiKey,
} from "@/lib/api-key-storage";
import { toast } from "sonner";

export function ApiKeyModal() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    setValue(getApiKey() ?? "");
    setHasSaved(!!getApiKey());
  }, [open]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(API_KEY_OPEN_EVENT, handler);
    return () => window.removeEventListener(API_KEY_OPEN_EVENT, handler);
  }, []);

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("API 키를 입력해주세요.");
      return;
    }
    setApiKey(trimmed);
    setHasSaved(true);
    toast.success("API 키가 저장되었습니다.");
    setOpen(false);
  };

  const remove = () => {
    clearApiKey();
    setValue("");
    setHasSaved(false);
    toast.message("API 키가 삭제되었습니다.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="API 키 설정"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="inline-flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
              <KeyRound className="h-4 w-4" />
            </div>
            <DialogTitle>Gemini API 키 설정</DialogTitle>
          </div>
          <DialogDescription className="pt-1 leading-relaxed">
            AI 컬럼 매핑·위험 탐지 등 AI 기능을 사용하려면 본인의 Gemini API 키가
            필요합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="apikey">API 키</Label>
            <div className="relative">
              <Input
                id="apikey"
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
                className="pr-10 font-mono tracking-tight"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "키 숨기기" : "키 보기"}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
          >
            Gemini API 키 발급받기
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              입력한 키는 이 브라우저에만 저장되며 서버로 전송되지 않습니다.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          {hasSaved ? (
            <Button variant="ghost" onClick={remove} size="sm" className="text-muted-foreground">
              저장된 키 삭제
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button variant="accent" onClick={save}>
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
