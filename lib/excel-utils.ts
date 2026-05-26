import * as XLSX from "xlsx";
import type {
  CardCompany,
  ColumnMapping,
  Transaction,
  Settlement,
  RiskAssessment,
} from "./types";
import { formatDateTime, formatKRW, maskCard } from "./format";
import { riskLevelLabel, tierLabel } from "./risk-rules";

/* ---------- 파싱 ---------- */

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  sampleRows: Record<string, unknown>[]; // 첫 3행
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array", cellDates: true });
}

export function extractSheet(wb: XLSX.WorkBook, sheetName?: string): ParsedSheet {
  const name = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`시트 '${name}'을(를) 찾을 수 없습니다.`);

  // 헤더 자동 추정: 첫 10행을 보고 비어있는 행 건너뛰고 가장 컬럼 많은 행을 헤더로
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  }) as unknown as unknown[][];

  if (!raw.length) return { sheetName: name, headers: [], rows: [], sampleRows: [] };

  let headerIdx = 0;
  let bestCount = 0;
  const scanLimit = Math.min(raw.length, 10);
  for (let i = 0; i < scanLimit; i++) {
    const row = raw[i] || [];
    const count = row.filter((c) => String(c || "").trim() !== "").length;
    if (count > bestCount) {
      bestCount = count;
      headerIdx = i;
    }
  }

  const headers = (raw[headerIdx] as unknown[]).map((h, idx) =>
    String(h ?? "").trim() || `컬럼${idx + 1}`,
  );

  const dataRows: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    dataRows.push(obj);
  }

  return {
    sheetName: name,
    headers,
    rows: dataRows,
    sampleRows: dataRows.slice(0, 3),
  };
}

/* ---------- 매핑 → 표준 Transaction ---------- */

function parseAmount(v: unknown): number {
  if (typeof v === "number") return Math.round(v);
  const s = String(v ?? "").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n) : 0;
}

function parseDate(v: unknown): string {
  if (!v && v !== 0) return "";
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  // 한국형 "2025-01-15 13:25" / "2025.01.15 13:25"
  const norm = s.replace(/\./g, "-").replace(/\//g, "-");
  const d = new Date(norm);
  if (!isNaN(d.getTime())) return d.toISOString();
  return s; // fallback
}

function parseLast4(v: unknown): string {
  const s = String(v ?? "").replace(/[^0-9*xX]/g, "");
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  // 마스킹된 카드 ex) 1234-****-****-5678
  const last = s.slice(-4).replace(/\D/g, "0");
  return last.padStart(4, "0");
}

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  cardCompany: CardCompany,
  batchId: string,
): Transaction[] {
  const now = new Date().toISOString();
  const out: Transaction[] = [];

  rows.forEach((row, i) => {
    const amount = parseAmount(row[mapping.amount]);
    const paidAt = parseDate(row[mapping.paidAt]);
    const merchantName = String(row[mapping.merchantName] ?? "").trim();
    const cardLast4 = parseLast4(row[mapping.cardLast4]);
    if (!merchantName || !paidAt) return;
    out.push({
      id: `${batchId}-${i}`,
      paidAt,
      merchantName,
      merchantCategory: mapping.merchantCategory
        ? String(row[mapping.merchantCategory] ?? "").trim() || undefined
        : undefined,
      merchantCode: mapping.merchantCode
        ? String(row[mapping.merchantCode] ?? "").trim() || undefined
        : undefined,
      amount,
      cardLast4,
      cardholderName: mapping.cardholderName
        ? String(row[mapping.cardholderName] ?? "").trim() || undefined
        : undefined,
      department: mapping.department
        ? String(row[mapping.department] ?? "").trim() || undefined
        : undefined,
      cardCompany,
      uploadedAt: now,
      uploadBatchId: batchId,
    });
  });

  return out;
}

/* ---------- 내보내기 ---------- */

export function exportTransactionsXlsx(opts: {
  fileName: string;
  txns: Transaction[];
  settlements: Settlement[];
  risks: RiskAssessment[];
}) {
  const { fileName, txns, settlements, risks } = opts;
  const sMap = new Map(settlements.map((s) => [s.transactionId, s]));
  const rMap = new Map(risks.map((r) => [r.transactionId, r]));

  const rows = txns.map((t) => {
    const s = sMap.get(t.id);
    const r = rMap.get(t.id);
    return {
      결제일시: formatDateTime(t.paidAt),
      카드사: t.cardCompany,
      "카드번호 끝4자리": maskCard(t.cardLast4),
      사용자: t.cardholderName || "-",
      부서: t.department || "-",
      가맹점: t.merchantName,
      업종: t.merchantCategory || "-",
      업종코드: t.merchantCode || "-",
      금액: t.amount,
      금액구간: r ? tierLabel(r.amountTier) : "-",
      위험도: r ? riskLevelLabel(r.level) : "-",
      위험사유: r ? r.reasons.join(" / ") : "-",
      "정산 - 참석자": s?.attendees || "",
      "정산 - 목적": s?.purpose || "",
      사전승인서: s?.hasPreApproval ? "있음" : "",
      결재문서번호: s?.approvalDocNumber || "",
      "정산 입력일시": s ? formatDateTime(s.submittedAt) : "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  // 금액 컬럼은 숫자 포맷
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = 1; R <= range.e.r; R++) {
    const cell = ws[XLSX.utils.encode_cell({ r: R, c: 8 })];
    if (cell) cell.z = "#,##0";
  }
  ws["!cols"] = [
    { wch: 18 }, { wch: 8 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
    { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 24 }, { wch: 10 },
    { wch: 18 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "법인카드 보고서");
  XLSX.writeFile(wb, fileName);
}
