"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Database,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Container, PageHeader } from "@/components/layout/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  applyMapping,
  extractSheet,
  readWorkbook,
  type ParsedSheet,
} from "@/lib/excel-utils";
import { mapColumnsWithAI } from "@/lib/ai-mapping";
import { MissingApiKeyError } from "@/lib/gemini-client";
import {
  addBatch,
  addTransactions,
  getBatches,
  getRisks,
  getSettlements,
  getTransactions,
  resetAllData,
  saveRisks,
} from "@/lib/storage";
import { ruleBasedRisk } from "@/lib/risk-rules";
import type {
  CardCompany,
  ColumnMapping,
  Transaction,
  UploadBatch,
} from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const CARD_COMPANIES: CardCompany[] = [
  "신한", "삼성", "국민", "현대", "롯데", "BC", "NH농협", "하나", "기타",
];

const STANDARD_FIELDS: Array<{ key: keyof ColumnMapping; label: string; required: boolean }> = [
  { key: "paidAt", label: "결제일시", required: true },
  { key: "merchantName", label: "가맹점명", required: true },
  { key: "amount", label: "금액", required: true },
  { key: "cardLast4", label: "카드번호(끝 4자리)", required: true },
  { key: "merchantCategory", label: "업종/업태", required: false },
  { key: "merchantCode", label: "업종코드", required: false },
  { key: "cardholderName", label: "사용자명", required: false },
  { key: "department", label: "부서", required: false },
];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [cardCompany, setCardCompany] = useState<CardCompany>("신한");
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const batches = useMemo(() => getBatches(), [refreshKey]);
  const totalTxns = useMemo(() => getTransactions().length, [refreshKey]);

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setMapping(null);
    try {
      const wb = await readWorkbook(f);
      const parsed = extractSheet(wb);
      setSheet(parsed);
      if (!parsed.headers.length) {
        toast.error("엑셀 헤더를 인식할 수 없습니다.");
      } else {
        toast.success(`엑셀을 읽었습니다. ${parsed.rows.length}개 행 감지`);
      }
    } catch (e) {
      toast.error("엑셀 파일을 읽을 수 없습니다.");
      setSheet(null);
    }
  }, []);

  const runAi = useCallback(async () => {
    if (!sheet) return;
    setAnalyzing(true);
    try {
      const m = await mapColumnsWithAI({
        headers: sheet.headers,
        sampleRows: sheet.sampleRows,
      });
      setMapping(m);
      toast.success(`컬럼 매핑 완료 (신뢰도 ${Math.round(m.confidence * 100)}%)`);
    } catch (e) {
      if (e instanceof MissingApiKeyError) {
        toast.message("Gemini API 키가 필요합니다. 우측 상단 ⚙️ 버튼에서 설정해주세요.");
      } else {
        toast.error("AI 매핑 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류"));
      }
    } finally {
      setAnalyzing(false);
    }
  }, [sheet]);

  const updateMapping = (key: keyof ColumnMapping, value: string) => {
    setMapping((prev) => {
      const base: ColumnMapping =
        prev || {
          paidAt: "",
          merchantName: "",
          amount: "",
          cardLast4: "",
          confidence: 0,
        };
      return { ...base, [key]: value || undefined };
    });
  };

  const requiredOk =
    !!mapping &&
    !!mapping.paidAt &&
    !!mapping.merchantName &&
    !!mapping.amount &&
    !!mapping.cardLast4;

  const onSave = useCallback(async () => {
    if (!sheet || !mapping || !requiredOk) return;
    setSaving(true);
    try {
      const batchId = `b-${Date.now()}`;
      const txns: Transaction[] = applyMapping(
        sheet.rows,
        mapping,
        cardCompany,
        batchId,
      );
      if (!txns.length) {
        toast.error("유효한 결제 내역이 없습니다.");
        return;
      }

      const dates = txns.map((t) => new Date(t.paidAt).getTime()).filter((n) => !isNaN(n));
      const batch: UploadBatch = {
        id: batchId,
        uploadedAt: new Date().toISOString(),
        fileName: file?.name || "업로드.xlsx",
        cardCompany,
        rowCount: txns.length,
        periodStart: dates.length
          ? new Date(Math.min(...dates)).toISOString()
          : undefined,
        periodEnd: dates.length
          ? new Date(Math.max(...dates)).toISOString()
          : undefined,
      };

      addTransactions(txns);
      addBatch(batch);

      // 룰 베이스 위험 분석 즉시 저장
      const risks = getRisks().filter((r) => !txns.find((t) => t.id === r.transactionId));
      txns.forEach((t) => risks.push(ruleBasedRisk(t)));
      saveRisks(risks);

      toast.success(`${txns.length}건이 저장되었습니다.`);
      setFile(null);
      setSheet(null);
      setMapping(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error("저장 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류"));
    } finally {
      setSaving(false);
    }
  }, [sheet, mapping, cardCompany, file, requiredOk]);

  return (
    <Container size="lg">
      <PageHeader
        title="카드사 청구 엑셀 업로드"
        description="신한·삼성·국민·현대 등 카드사 양식 그대로 업로드하세요. AI가 컬럼을 자동 매핑해 표준 스키마로 통일합니다."
        actions={
          totalTxns > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("저장된 전체 결제·정산·위험 데이터를 삭제할까요?")) {
                  resetAllData();
                  setRefreshKey((k) => k + 1);
                  toast.success("전체 데이터가 초기화되었습니다.");
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              데이터 초기화
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* 카드사 + 파일 선택 */}
          <Card>
            <CardHeader>
              <CardTitle>1. 카드사 선택 및 파일 업로드</CardTitle>
              <CardDescription>
                카드사를 먼저 선택하고 청구 내역 엑셀(.xlsx, .xls)을 선택하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2">
                <Label>카드사</Label>
                <Select
                  value={cardCompany}
                  onValueChange={(v) => setCardCompany(v as CardCompany)}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_COMPANIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}카드
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DropZone file={file} onFile={onFile} onClear={() => { setFile(null); setSheet(null); setMapping(null); }} />

              {sheet && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                  <div className="flex items-center gap-2 text-foreground/90">
                    <FileSpreadsheet className="h-4 w-4 text-accent" />
                    헤더 <strong className="tabular-nums">{sheet.headers.length}</strong>개 · 데이터{" "}
                    <strong className="tabular-nums">{sheet.rows.length}</strong>행 감지됨
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sheet.headers.slice(0, 12).map((h) => (
                      <Badge key={h} variant="outline" className="font-normal">
                        {h}
                      </Badge>
                    ))}
                    {sheet.headers.length > 12 && (
                      <Badge variant="muted">+{sheet.headers.length - 12}</Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI 매핑 */}
          {sheet && (
            <Card>
              <CardHeader>
                <CardTitle>2. AI 컬럼 자동 매핑</CardTitle>
                <CardDescription>
                  Gemini가 헤더와 샘플 데이터를 분석해 표준 컬럼으로 매핑합니다. 결과를 확인 후
                  수정할 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={runAi} disabled={analyzing} variant="accent">
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {analyzing ? "AI 분석 중..." : "AI로 컬럼 매핑하기"}
                </Button>

                {mapping && (
                  <>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">매핑 신뢰도</span>
                        <span className="font-semibold tabular-nums">
                          {Math.round((mapping.confidence ?? 0) * 100)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.round((mapping.confidence ?? 0) * 100)}
                        className="mt-2"
                      />
                      {mapping.notes && (
                        <p className="mt-2 text-muted-foreground">{mapping.notes}</p>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {STANDARD_FIELDS.map((f) => (
                        <div key={f.key} className="grid gap-1.5">
                          <Label className="flex items-center gap-1.5 text-xs">
                            {f.label}
                            {f.required && (
                              <Badge variant="accent" className="text-[10px]">
                                필수
                              </Badge>
                            )}
                          </Label>
                          <Select
                            value={(mapping[f.key] as string) || "__none__"}
                            onValueChange={(v) =>
                              updateMapping(f.key, v === "__none__" ? "" : v)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="컬럼 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {!f.required && (
                                <SelectItem value="__none__">— 사용 안 함 —</SelectItem>
                              )}
                              {sheet.headers.map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    {!requiredOk && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        결제일시·가맹점·금액·카드번호 4가지 필수 컬럼이 모두 선택되어야 저장할 수 있습니다.
                      </div>
                    )}

                    <Button
                      size="lg"
                      className="w-full"
                      disabled={!requiredOk || saving}
                      onClick={onSave}
                      variant="default"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {sheet.rows.length}건을 표준 스키마로 저장
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* 우측: 업로드 이력 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">현재 저장 현황</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {totalTxns.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">건</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">전체 누적 결제 내역</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">업로드 이력</CardTitle>
              <CardDescription>최근 업로드 배치</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {batches.length === 0 && (
                <p className="text-xs text-muted-foreground">업로드된 배치가 없습니다.</p>
              )}
              {batches.slice(0, 8).map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-border/60 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{b.cardCompany}</Badge>
                    <span className="tabular-nums text-muted-foreground">
                      {b.rowCount.toLocaleString()}건
                    </span>
                  </div>
                  <p className="mt-1.5 truncate font-medium">{b.fileName}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {formatDateTime(b.uploadedAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}

function DropZone({
  file,
  onFile,
  onClear,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const [drag, setDrag] = useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        drag ? "border-accent bg-accent/5" : "border-border bg-muted/20 hover:border-accent/40"
      }`}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {file ? (
        <>
          <FileSpreadsheet className="h-8 w-8 text-accent" />
          <div>
            <p className="font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onClear();
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            다른 파일 선택
          </button>
        </>
      ) : (
        <>
          <UploadIcon className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              엑셀 파일을 끌어다 놓거나 <span className="text-accent">클릭하여 선택</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              .xlsx, .xls 지원 · 카드사 청구 내역 그대로 업로드 가능
            </p>
          </div>
        </>
      )}
    </label>
  );
}
