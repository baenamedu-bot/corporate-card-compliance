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
  Zap,
  RotateCw,
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
  applyPreset,
  detectCardCompany,
  normalizeDetectedCompany,
  type DetectionResult,
} from "@/lib/card-presets";
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

type MappingSource = "preset" | "ai" | "manual" | null;

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [cardCompany, setCardCompany] = useState<CardCompany>("신한");
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mappingSource, setMappingSource] = useState<MappingSource>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const batches = useMemo(() => getBatches(), [refreshKey]);
  const totalTxns = useMemo(() => getTransactions().length, [refreshKey]);

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setMapping(null);
    setMappingSource(null);
    setDetection(null);
    try {
      const wb = await readWorkbook(f);
      const parsed = extractSheet(wb);
      setSheet(parsed);
      if (!parsed.headers.length) {
        toast.error("엑셀 헤더를 인식할 수 없습니다.");
        return;
      }

      // 1) 카드사 자동 감지 (파일명 → 시트명 → 헤더)
      const det = detectCardCompany({
        fileName: f.name,
        sheetName: parsed.sheetName,
        headers: parsed.headers,
      });

      if (det) {
        setDetection(det);
        const normalized = normalizeDetectedCompany(det.company);
        setCardCompany(normalized);

        // 2) 프리셋 즉시 매핑 시도 (AI 호출 0)
        const preset = applyPreset(det.company, parsed.headers);
        if (preset) {
          setMapping(preset);
          setMappingSource("preset");
          toast.success(
            `${det.company}카드 프리셋으로 즉시 매핑됨 — AI 호출 없이 표준화 준비 완료`,
          );
          return;
        }

        // 감지는 됐는데 프리셋 매칭 실패 → AI 폴백 안내
        toast.message(
          `${det.company}카드 양식으로 감지됐지만 필수 컬럼이 다릅니다. AI 매핑이 필요합니다.`,
        );
      } else {
        toast.message(
          `${parsed.rows.length}개 행을 읽었습니다. 카드사 자동 감지 실패 — AI 매핑을 사용해주세요.`,
        );
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
      setMappingSource("ai");
      toast.success(`AI 매핑 완료 (신뢰도 ${Math.round(m.confidence * 100)}%)`);
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

  /** 사용자가 카드사를 수동으로 바꾸면 프리셋 재시도 */
  const onChangeCardCompany = useCallback(
    (c: CardCompany) => {
      setCardCompany(c);
      if (!sheet) return;
      // 이미 AI/수동 매핑이 있는 상태에서 카드사만 바꾸면 자동 덮어쓰지 않음
      if (mappingSource === "ai" || mappingSource === "manual") return;
      const preset = applyPreset(c, sheet.headers);
      if (preset) {
        setMapping(preset);
        setMappingSource("preset");
        toast.success(`${c}카드 프리셋으로 매핑됨 (AI 호출 없음)`);
      }
    },
    [sheet, mappingSource],
  );

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
    setMappingSource((s) => (s === "preset" || s === "ai" ? "manual" : s));
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
      setMappingSource(null);
      setDetection(null);
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
              <CardTitle>1. 파일 업로드 (카드사 자동 감지)</CardTitle>
              <CardDescription>
                청구 엑셀(.xlsx, .xls)을 올리면 파일명·시트명·헤더로 카드사를 자동 감지하고
                프리셋 매칭 시 AI 호출 없이 즉시 표준화합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <DropZone
                file={file}
                onFile={onFile}
                onClear={() => {
                  setFile(null);
                  setSheet(null);
                  setMapping(null);
                  setMappingSource(null);
                  setDetection(null);
                }}
              />

              {sheet && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                  <div className="flex items-center gap-2 text-foreground/90">
                    <FileSpreadsheet className="h-4 w-4 text-accent" />
                    시트{" "}
                    <strong className="font-mono">{sheet.sheetName}</strong> · 헤더{" "}
                    <strong className="tabular-nums">{sheet.headers.length}</strong>개 · 데이터{" "}
                    <strong className="tabular-nums">{sheet.rows.length}</strong>행
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

              {/* 카드사 (자동 감지 + 수동 변경) */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  카드사
                  {detection && (
                    <Badge variant="accent" className="text-[10px]">
                      <Zap className="h-2.5 w-2.5" />
                      {sourceLabel(detection.source)}으로 자동 감지
                    </Badge>
                  )}
                </Label>
                <Select
                  value={cardCompany}
                  onValueChange={(v) => onChangeCardCompany(v as CardCompany)}
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
                <p className="text-xs text-muted-foreground">
                  자동 감지 결과가 틀리면 카드사를 직접 선택하세요. 프리셋이 자동으로 재시도됩니다.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 매핑 영역 */}
          {sheet && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>2. 컬럼 매핑</CardTitle>
                    <CardDescription>
                      {mappingSource === "preset"
                        ? "카드사 프리셋으로 즉시 매핑되었습니다. AI 호출 없이 저장 가능합니다."
                        : mappingSource === "ai"
                          ? "AI가 헤더와 샘플 데이터를 분석해 매핑했습니다. 결과를 확인하고 저장하세요."
                          : "프리셋 매칭이 실패했거나 비표준 양식입니다. AI 매핑을 실행하세요."}
                    </CardDescription>
                  </div>
                  {mappingSource === "preset" && (
                    <Badge variant="emerald" className="shrink-0">
                      <Zap className="h-2.5 w-2.5" />
                      프리셋 즉시 매핑 · 토큰 0
                    </Badge>
                  )}
                  {mappingSource === "ai" && (
                    <Badge variant="accent" className="shrink-0">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI 매핑
                    </Badge>
                  )}
                  {mappingSource === "manual" && (
                    <Badge variant="muted" className="shrink-0">수동 수정됨</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {!mapping && (
                    <Button onClick={runAi} disabled={analyzing} variant="accent">
                      {analyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {analyzing ? "AI 분석 중..." : "AI로 컬럼 매핑하기"}
                    </Button>
                  )}
                  {mapping && mappingSource !== "ai" && (
                    <Button
                      onClick={runAi}
                      disabled={analyzing}
                      variant="outline"
                      size="sm"
                    >
                      {analyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4" />
                      )}
                      {analyzing ? "AI 분석 중..." : "AI로 다시 매핑"}
                    </Button>
                  )}
                </div>

                {mapping && (
                  <>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {mappingSource === "preset" ? "프리셋 매칭 신뢰도" : "매핑 신뢰도"}
                        </span>
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

        {/* 우측: 사이드바 */}
        <div className="space-y-6">
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">지원 프리셋</CardTitle>
                <Zap className="h-4 w-4 text-accent" />
              </div>
              <CardDescription>
                아래 카드사는 AI 호출 없이 즉시 매핑됩니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {["신한", "삼성", "국민", "현대", "롯데", "BC", "하나", "우리"].map((c) => (
                  <Badge key={c} variant="outline" className="border-accent/30 bg-background">
                    {c}카드
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                프리셋 매칭 시 Gemini 토큰 비용 0. 비표준 양식이거나 컬럼명이 변형된 경우
                AI 폴백이 자동 안내됩니다.
              </p>
            </CardContent>
          </Card>

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

function sourceLabel(source: DetectionResult["source"]): string {
  return source === "filename" ? "파일명" : source === "sheet" ? "시트명" : "헤더";
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
