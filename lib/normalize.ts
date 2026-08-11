// lib/normalize.ts — port 1:1 utils.gs (normalizeText_, cleanErpForMatching_, parseDateFlexible_...)
import { createHash } from "crypto";

const ERP_JUNK_VALUES = [
  "PENDING", "UPDATING", "UPDATING...", "DANG CAP NHAT", "CHUA CO", "CHUA CAP NHAT", "N/A", "NA",
];

export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeErp(v: unknown): string {
  return String(v ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

export function cleanErpForMatching(v: unknown): string {
  const raw = normalizeErp(v);
  if (!raw) return "";
  return ERP_JUNK_VALUES.includes(normalizeText(raw)) ? "" : raw;
}

export function parseDateFlexible(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  const s = String(v).trim();
  if (!s) return null;
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
  // Excel serial date number (khi đọc qua Sheets API đôi khi trả về number)
  if (typeof v === "number" && v > 20000 && v < 90000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Chọn giá trị "đầy đủ" hơn giữa 2 giá trị text — dùng khi gộp cùng 1 SP xuất hiện
 *  nhiều lần trong cùng 1 lần sync (ví dụ trùng ERP ở cả CE và GD, hiếm nhưng có thể). */
export function chonGiaTriDayDuHon(a?: string | null, b?: string | null): string {
  const as = (a ?? "").trim();
  const bs = (b ?? "").trim();
  if (!as) return b ?? "";
  if (!bs) return a ?? "";
  return bs.length > as.length ? bs : as;
}
