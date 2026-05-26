import type {
  Transaction,
  Settlement,
  RiskAssessment,
  UploadBatch,
} from "./types";

const KEYS = {
  transactions: "ccc.transactions",
  settlements: "ccc.settlements",
  risks: "ccc.risk_assessments",
  batches: "ccc.upload_batches",
  currentCard: "ccc.current_card_last4",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

/* Transactions */
export function getTransactions(): Transaction[] {
  return read<Transaction[]>(KEYS.transactions, []);
}
export function saveTransactions(items: Transaction[]) {
  write(KEYS.transactions, items);
}
export function addTransactions(items: Transaction[]) {
  const existing = getTransactions();
  saveTransactions([...existing, ...items]);
}
export function clearTransactions() {
  saveTransactions([]);
}

/* Settlements */
export function getSettlements(): Settlement[] {
  return read<Settlement[]>(KEYS.settlements, []);
}
export function saveSettlements(items: Settlement[]) {
  write(KEYS.settlements, items);
}
export function upsertSettlement(s: Settlement) {
  const all = getSettlements().filter((x) => x.transactionId !== s.transactionId);
  all.push(s);
  saveSettlements(all);
}
export function getSettlementByTxn(transactionId: string): Settlement | undefined {
  return getSettlements().find((s) => s.transactionId === transactionId);
}

/* Risks */
export function getRisks(): RiskAssessment[] {
  return read<RiskAssessment[]>(KEYS.risks, []);
}
export function saveRisks(items: RiskAssessment[]) {
  write(KEYS.risks, items);
}
export function upsertRisk(r: RiskAssessment) {
  const all = getRisks().filter((x) => x.transactionId !== r.transactionId);
  all.push(r);
  saveRisks(all);
}
export function getRiskByTxn(transactionId: string): RiskAssessment | undefined {
  return getRisks().find((r) => r.transactionId === transactionId);
}

/* Batches */
export function getBatches(): UploadBatch[] {
  return read<UploadBatch[]>(KEYS.batches, []);
}
export function addBatch(b: UploadBatch) {
  const all = getBatches();
  all.unshift(b);
  write(KEYS.batches, all);
}

/* Current card last4 (session-like, per browser) */
export function getCurrentCardLast4(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEYS.currentCard);
}
export function setCurrentCardLast4(last4: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYS.currentCard, last4);
}
export function clearCurrentCardLast4() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEYS.currentCard);
}

/* Bulk reset (debug/관리자) */
export function resetAllData() {
  if (typeof window === "undefined") return;
  Object.values(KEYS).forEach((k) => window.localStorage.removeItem(k));
}
