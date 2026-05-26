"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  ShieldAlert,
  FileSignature,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Settlement, Transaction } from "@/lib/types";
import { formatDateTime, formatKRW } from "@/lib/format";
import {
  amountTier,
  isSettled,
  riskBarClass,
  ruleBasedRisk,
  tierDescription,
  tierLabel,
  validateSettlement,
} from "@/lib/risk-rules";
import { upsertRisk, upsertSettlement } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function TransactionItem({
  txn,
  settlement,
  onSaved,
}: {
  txn: Transaction;
  settlement?: Settlement;
  onSaved: () => void;
}) {
  const tier = amountTier(txn.amount);
  const settled = isSettled(settlement);
  const risk = ruleBasedRisk(txn);

  const [open, setOpen] = useState(!settled && tier >= 1);
  const [attendees, setAttendees] = useState(settlement?.attendees ?? "");
  const [purpose, setPurpose] = useState(settlement?.purpose ?? "");
  const [hasPreApproval, setHasPreApproval] = useState(settlement?.hasPreApproval ?? false);
  const [approvalDocNumber, setApprovalDocNumber] = useState(
    settlement?.approvalDocNumber ?? "",
  );
  const [saving, setSaving] = useState(false);

  const save = () => {
    const v = validateSettlement(
      txn.amount,
      attendees,
      purpose,
      hasPreApproval,
      approvalDocNumber,
    );
    if (!v.ok) {
      toast.error(v.reason || "입력값을 확인해주세요.");
      return;
    }
    setSaving(true);
    try {
      upsertSettlement({
        transactionId: txn.id,
        attendees: attendees.trim(),
        purpose: purpose.trim(),
        hasPreApproval: tier >= 1 ? hasPreApproval : undefined,
        approvalDocNumber: tier >= 2 ? approvalDocNumber.trim() : undefined,
        submittedAt: new Date().toISOString(),
        submittedByLast4: txn.cardLast4,
      });
      // 위험 평가 갱신
      upsertRisk(risk);
      toast.success("정산이 저장되었습니다.");
      onSaved();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={cn("overflow-hidden", riskBarClass(risk.level))}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/30"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              settled
                ? "bg-emerald-50 text-emerald-600"
                : "bg-muted text-muted-foreground",
            )}
          >
            {settled ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Clock className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{txn.merchantName}</p>
              {tier === 3 && (
                <Badge variant="red" className="shrink-0">
                  최고 위험
                </Badge>
              )}
              {tier === 2 && (
                <Badge variant="amber" className="shrink-0">
                  사전 승인 필수
                </Badge>
              )}
              {tier === 1 && (
                <Badge variant="muted" className="shrink-0">
                  사후 보고
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDateTime(txn.paidAt)}
              {txn.merchantCategory && (
                <>
                  <span>·</span>
                  <Building2 className="h-3 w-3" />
                  {txn.merchantCategory}
                </>
              )}
              <span>·</span>
              <span>{txn.cardCompany}카드</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="text-base font-semibold tabular-nums">
            {formatKRW(txn.amount)}
          </p>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 bg-muted/20 px-5 py-5">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-border/60 bg-background p-3 text-xs">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="space-y-0.5">
              <p className="font-medium">
                {tierLabel(tier)} — {formatKRW(txn.amount)}
              </p>
              <p className="text-muted-foreground">{tierDescription(tier)}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`attendees-${txn.id}`}>참석자 *</Label>
              <Input
                id={`attendees-${txn.id}`}
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="예: 홍길동 부장(자사) / 김OO 팀장(○○자산운용)"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`purpose-${txn.id}`}>접대 목적 *</Label>
              <Textarea
                id={`purpose-${txn.id}`}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="예: 신규 IPO 참여 협의 관련 영업 미팅"
                rows={2}
              />
            </div>

            {tier === 1 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <Checkbox
                  checked={hasPreApproval}
                  onChange={(e) => setHasPreApproval(e.target.checked)}
                  label={
                    <span>
                      <strong>사전 승인서 존재 확인</strong> · 50만원 이상 결제는 사후 보고 시
                      사전 승인서가 존재해야 합니다.
                    </span>
                  }
                />
              </div>
            )}

            {tier >= 2 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <Label htmlFor={`docnum-${txn.id}`} className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-amber-700" />
                  사전 승인서 결재문서 번호 *
                </Label>
                <Input
                  id={`docnum-${txn.id}`}
                  value={approvalDocNumber}
                  onChange={(e) => setApprovalDocNumber(e.target.value)}
                  placeholder="예: APV-2025-0142"
                  className="mt-2 font-mono"
                />
                <p className="mt-2 text-xs text-amber-800">
                  {tier === 2
                    ? "100만원 이상 200만원 미만 — 결재문서 번호 필수"
                    : "200만원 이상 — 결재문서 번호 필수 + 컴플라이언스 자동 통보 대상"}
                </p>
              </div>
            )}

            {tier === 3 && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                이 결제는 <strong>최고 위험 등급</strong>으로 자동 분류되어 준법감시 담당자에게
                통보 표시됩니다.
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">
                {settled
                  ? `최근 저장: ${formatDateTime(settlement!.submittedAt)}`
                  : "주 1회 [참석자·목적] 입력만으로 정산이 완료됩니다."}
              </p>
              <Button onClick={save} disabled={saving} variant="accent">
                {settled ? "수정 저장" : "정산 저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
