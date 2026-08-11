// lib/headerDetect.ts — port mapping.gs (findHeaderRow_, matchHeaderRow_).
// QUAN TRỌNG: alias đọc từ bảng FieldMapping trong DB (sửa qua UI /settings/mapping),
// KHÔNG hardcode trong code — đúng yêu cầu "cấu trúc cột lúc nào cũng đổi, không có rule cố định".
import { db } from "./db";
import { normalizeText } from "./normalize";

export const INTERNAL_FIELDS = [
  "ngayOrder", "nganhHang", "tenModel", "maErp", "idSanPham",
  "linkFolder", "userPic", "linkHinh", "trangThaiOnweb", "ngayOnwebSrc",
  // "NHÂN SỰ KHAI BÁO" trong Order CE — chỉ dùng làm GỢI Ý ban đầu lúc tạo SP mới
  // (quyết định #10), không phải trường sync ghi đè liên tục.
  "nhanSuKhaiBao",
] as const;
export type InternalField = (typeof INTERNAL_FIELDS)[number];

type HeaderIndex = Record<InternalField, number>;

export async function getFieldMapping(sourceKey: string): Promise<Record<string, string[]>> {
  const rows = await db.fieldMapping.findMany({
    where: { sourceKey: { in: ["ALL", sourceKey] } },
  });
  const map: Record<string, string[]> = {};
  // ALL trước, rồi override bằng alias riêng của sourceKey (giống seedDefaultMapping_ cũ)
  rows
    .sort((a, b) => (a.sourceKey === "ALL" ? -1 : 1))
    .forEach((r) => {
      map[r.internalField] = r.aliases;
    });
  return map;
}

function matchHeaderRow(headerRow: unknown[], mapping: Record<string, string[]>): HeaderIndex {
  const hs = headerRow.map(normalizeText);
  function findAny(aliases?: string[]): number {
    if (!aliases) return -1;
    for (let i = 0; i < hs.length; i++) {
      for (const alias of aliases) {
        const k = normalizeText(alias);
        if (hs[i] === k || hs[i].indexOf(k) === 0) return i;
      }
    }
    return -1;
  }
  const idx = {} as HeaderIndex;
  for (const f of INTERNAL_FIELDS) idx[f] = findAny(mapping[f]);
  return idx;
}

export type HeaderMeta = { headerRow: number; idx: HeaderIndex; data: unknown[][] };

const HEADER_SCAN_ROWS = 8; // giống _SETTING.HEADER_SCAN_ROWS mặc định — quét 8 dòng đầu tìm header

export async function findHeaderRow(values: unknown[][], sourceKey: string): Promise<HeaderMeta | null> {
  const mapping = await getFieldMapping(sourceKey);
  const scanRows = Math.min(HEADER_SCAN_ROWS, values.length);
  let best = { row: -1, idx: null as HeaderIndex | null, score: -1 };
  for (let r = 0; r < scanRows; r++) {
    const idx = matchHeaderRow(values[r] ?? [], mapping);
    const score = INTERNAL_FIELDS.filter((f) => idx[f] >= 0).length;
    if (score > best.score) best = { row: r, idx, score };
  }
  if (best.row < 0 || best.score < 3 || best.row >= values.length - 1 || !best.idx) return null;
  return { headerRow: best.row + 1, idx: best.idx, data: values.slice(best.row + 1) };
}
