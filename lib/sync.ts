// lib/sync.ts — port sync.gs + import.gs sang Postgres/Prisma.
//
// RULE ĐÃ CHỐT (10 quyết định với anh Đức):
//  - Khớp sản phẩm theo ERP (chính) + fingerprint Tên+Ngành (chỉ để phát hiện nghi trùng).
//  - ERP đã tồn tại:
//      + Nếu dữ liệu nguồn (Tên SP/Ngày Order/Ngành hàng/Specs) GIỐNG hệ thống -> chỉ verify.
//      + Nếu KHÁC -> KHÔNG tự áp dụng, KHÔNG im lặng bỏ qua. Tạo/refresh 1 Conflict loại
//        SOURCE_CHANGED để web app hiện badge nhỏ trên dòng sản phẩm đó (quyết định #9).
//        Người dùng tự bấm xác nhận mới đổi.
//  - ERP chưa tồn tại -> tạo sản phẩm mới (INSERT). Nếu Order CE có sẵn "NHÂN SỰ KHAI BÁO"
//    -> tạo Assignment role=KHAI_BAO, status='Suggested' làm gợi ý ban đầu (quyết định #10),
//    người dùng đăng nhập sửa gì trong nhóm đó sẽ tự ghi đè bằng dòng 'Confirmed' của họ.
//  - CÁC TRƯỜNG TĨNH TUYỆT ĐỐI — sync KHÔNG BAO GIỜ đụng vào: id, idPhienBanList, maModel,
//    maBienThe, siteKinhDoanh, ghiChu, baiVietSiteDmx/Tgdd, slider, video*, 3 Nhân sự (trừ
//    gợi ý ban đầu lúc TẠO MỚI như trên).
//  - Sản phẩm MỚI luôn hiện ở đầu danh sách -> đảm bảo bằng cách sort theo createdAt desc
//    ở tầng truy vấn (xem app/products/page.tsx), KHÔNG cần logic gì thêm ở đây.
//  - Chống đọc trùng dòng nguồn bằng RowHash (bảng RawImportHash).
//  - HARD_CONFLICT / POSSIBLE_DUPLICATE: giữ nguyên như bản trước.

import { db } from "./db";
import { fetchSheetValues, getSourceListFromEnv, type SourceConfig } from "./sheetsClient";
import { findHeaderRow } from "./headerDetect";
import { cleanErpForMatching, normalizeText, parseDateFlexible, sha256 } from "./normalize";

type RawRow = {
  sourceKey: "LT" | "CE" | "GD";
  ngayOrder: Date | null;
  nganhHang: string;
  tenSanPham: string;
  erp: string;
  specs: string;
  linkHinh: string;
  nhanSuKhaiBao: string;
  onwebHint: boolean;
  rowHash: string;
};

function detectOnwebHint(trangThaiRaw: unknown): boolean {
  if (trangThaiRaw === true) return true;
  const s = normalizeText(trangThaiRaw);
  if (!s) return false;
  const truthy = ["DA ONWEB", "DA LEN WEB", "ONWEB", "DONE", "HOAN THANH", "X", "TRUE", "V"];
  return truthy.includes(s);
}

async function fetchRawFromSource(src: SourceConfig): Promise<RawRow[]> {
  const values = await fetchSheetValues(src);
  if (!values || values.length < 2) return [];
  const meta = await findHeaderRow(values, src.key);
  if (!meta) throw new Error(`Không dò được header của nguồn: ${src.name} (kiểm tra bảng FieldMapping)`);

  const rows: RawRow[] = [];
  for (const row of meta.data) {
    // Đem hết MỌI dòng có ít nhất 1 ô có dữ liệu (quyết định mới) — KHÔNG còn yêu cầu
    // phải có ERP hoặc Tên sản phẩm như trước. Chỉ bỏ qua dòng HOÀN TOÀN trống.
    const hasAnyData = row.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasAnyData) continue;

    const erp = meta.idx.maErp >= 0 ? cleanErpForMatching(row[meta.idx.maErp]) : "";
    const ten = meta.idx.tenModel >= 0 ? String(row[meta.idx.tenModel] ?? "").trim() : "";
    const rowObj: Omit<RawRow, "rowHash"> = {
      sourceKey: src.key,
      ngayOrder: meta.idx.ngayOrder >= 0 ? parseDateFlexible(row[meta.idx.ngayOrder]) : null,
      nganhHang: meta.idx.nganhHang >= 0 ? String(row[meta.idx.nganhHang] ?? "").trim() : "",
      tenSanPham: ten,
      erp,
      specs: meta.idx.linkFolder >= 0 ? String(row[meta.idx.linkFolder] ?? "").trim() : "",
      linkHinh: meta.idx.linkHinh >= 0 ? String(row[meta.idx.linkHinh] ?? "").trim() : "",
      nhanSuKhaiBao: meta.idx.userPic >= 0 ? String(row[meta.idx.userPic] ?? "").trim() : "",
      onwebHint: meta.idx.trangThaiOnweb >= 0 ? detectOnwebHint(row[meta.idx.trangThaiOnweb]) : false,
    };
    const rowHash = sha256(
      [rowObj.sourceKey, rowObj.erp, rowObj.tenSanPham, rowObj.nganhHang, rowObj.specs,
       rowObj.linkHinh, rowObj.ngayOrder?.getTime() ?? "", rowObj.onwebHint]
        .join("|")
    );
    rows.push({ ...rowObj, rowHash });
  }
  return rows;
}

function fingerprintKey(ten: string, nganh: string): string | null {
  const k = normalizeText(ten);
  if (!k) return null;
  return `${k}|${normalizeText(nganh)}`;
}

export type SyncStats = {
  triggeredBy: string;
  totalRawRead: number;
  newProducts: number;
  skippedExisting: number;
  sourceChangedDetected: number;
  conflicts: number;
  errors: number;
  skipped: number;
  errorDetail: string;
  durationMs: number;
  newUuids: string[];
};

export async function runIncrementalSync(triggeredBy: string): Promise<SyncStats> {
  const start = Date.now();
  const stats: SyncStats = {
    triggeredBy, totalRawRead: 0, newProducts: 0, skippedExisting: 0, sourceChangedDetected: 0,
    conflicts: 0, errors: 0, skipped: 0, errorDetail: "", durationMs: 0, newUuids: [],
  };
  const errorMsgs: string[] = [];
  const doneState = await getDoneStateName();
  const firstState = await getFirstState();

  for (const src of getSourceListFromEnv()) {
    let rawRows: RawRow[];
    try {
      rawRows = await fetchRawFromSource(src);
    } catch (err) {
      stats.errors++;
      errorMsgs.push(`${src.name}: ${String(err)}`);
      continue;
    }
    stats.totalRawRead += rawRows.length;

    const hashes = rawRows.map((r) => r.rowHash);
    const seen = await db.rawImportHash.findMany({ where: { rowHash: { in: hashes } }, select: { rowHash: true } });
    const seenSet = new Set(seen.map((s) => s.rowHash));
    const freshRows = rawRows.filter((r) => {
      if (seenSet.has(r.rowHash)) { stats.skipped++; return false; }
      return true;
    });
    if (!freshRows.length) continue;

    for (const row of freshRows) {
      try {
        await processRow(row, doneState, firstState, stats);
      } catch (err) {
        stats.errors++;
        errorMsgs.push(`${src.name} / ERP=${row.erp}: ${String(err)}`);
      }
    }

    await db.rawImportHash.createMany({
      data: freshRows.map((r) => ({ rowHash: r.rowHash, sourceKey: r.sourceKey })),
      skipDuplicates: true,
    });
  }

  stats.errorDetail = errorMsgs.join(" | ");
  stats.durationMs = Date.now() - start;

  await db.syncRun.create({
    data: {
      triggeredBy, durationMs: stats.durationMs, totalRawRead: stats.totalRawRead,
      newProducts: stats.newProducts, conflicts: stats.conflicts + stats.sourceChangedDetected,
      errors: stats.errors, skipped: stats.skipped, errorDetail: stats.errorDetail || null,
    },
  });

  return stats;
}

// Các trường được so sánh để phát hiện "nguồn đã đổi khác hệ thống" (quyết định #9).
// CHỈ so sánh nhóm (1) THÔNG TIN CƠ BẢN + Specs — đúng nhóm mà sync có quyền ghi.
const WATCHED_SOURCE_FIELDS: { key: keyof RawRow; label: string }[] = [
  { key: "tenSanPham", label: "TenSanPham" },
  { key: "nganhHang", label: "NganhHang" },
  { key: "specs", label: "Specs" },
  { key: "linkHinh", label: "LinkHinh" },
];

async function processRow(row: RawRow, doneState: string, firstState: string, stats: SyncStats): Promise<void> {
  if (row.erp) {
    const existing = await db.product.findUnique({ where: { erp: row.erp } });
    if (existing) {
      await handleExistingProductRow(existing, row, stats);
      return;
    }
  }

  if (!row.erp) {
    const fp = fingerprintKey(row.tenSanPham, row.nganhHang);
    if (fp) {
      const candidates = await db.product.findMany({
        where: { erp: null, tenSanPham: { equals: row.tenSanPham, mode: "insensitive" } },
      });
      if (candidates.length > 1) {
        await db.conflict.create({
          data: {
            type: "POSSIBLE_DUPLICATE", sourceKey: row.sourceKey, field: "Fingerprint (Tên+Ngành)",
            masterValue: candidates.map((c) => c.uuid).join(", "),
            incomingValue: `${row.tenSanPham} | ${row.nganhHang}`,
          },
        });
        stats.conflicts++;
        return;
      }
      if (candidates.length === 1) {
        await handleExistingProductRow(candidates[0], row, stats);
        return;
      }
    }
  }

  // TẠO SẢN PHẨM MỚI (đem hết, kể cả thiếu Tên -> dùng placeholder để không vi phạm NOT NULL)
  const state = row.onwebHint ? doneState : firstState;
  const created = await db.product.create({
    data: {
      tenSanPham: row.tenSanPham || "(chưa có tên)",
      erp: row.erp || null,
      nganhHang: row.nganhHang || null,
      ngayOrder: row.ngayOrder,
      nguonGoc: row.sourceKey,
      specs: row.specs || null,
      linkHinh: row.linkHinh || null,
      createdBy: "SYSTEM_SYNC",
      workflow: { create: { state, ngayOnweb: state === doneState ? new Date() : null } },
      // Gợi ý ban đầu cho Nhân sự Khai báo (quyết định #10) — status='Suggested', maNV=null
      // vì đây là tên tự do lấy từ Sheet nguồn, chưa chắc khớp với Staff nào đã đăng ký.
      // Người đăng nhập đầu tiên sửa nhóm "Khai báo sản phẩm" sẽ tự ghi đè bằng dòng của họ.
      ...(row.nhanSuKhaiBao
        ? { assignments: { create: [{ role: "KHAI_BAO", userName: row.nhanSuKhaiBao, status: "Suggested" }] } }
        : {}),
      history: {
        create: [{ field: "ALL", oldValue: "", newValue: `SP mới tạo từ ${row.sourceKey}`, changedBy: "SYSTEM_SYNC", changeType: "CREATED" }],
      },
    },
  });
  stats.newProducts++;
  stats.newUuids.push(created.uuid);
}

async function handleExistingProductRow(
  existing: { uuid: string; tenSanPham: string; nganhHang: string | null; specs: string | null; linkHinh: string | null },
  row: RawRow,
  stats: SyncStats
): Promise<void> {
  const diffs: { field: string; masterValue: string; incomingValue: string }[] = [];
  const currentByKey: Record<string, string> = {
    tenSanPham: existing.tenSanPham ?? "",
    nganhHang: existing.nganhHang ?? "",
    specs: existing.specs ?? "",
    linkHinh: existing.linkHinh ?? "",
  };
  for (const f of WATCHED_SOURCE_FIELDS) {
    const incoming = String(row[f.key] ?? "").trim();
    const current = currentByKey[f.key] ?? "";
    if (incoming && normalizeText(incoming) !== normalizeText(current)) {
      diffs.push({ field: f.label, masterValue: current, incomingValue: incoming });
    }
  }

  await db.product.update({ where: { uuid: existing.uuid }, data: { lastVerifiedAt: new Date() } });
  stats.skippedExisting++;

  if (!diffs.length) return;

  for (const d of diffs) {
    // Tránh tạo trùng badge nếu đã có 1 SOURCE_CHANGED đang Open cho đúng field này.
    const openExisting = await db.conflict.findFirst({
      where: { type: "SOURCE_CHANGED", matchedUuid: existing.uuid, field: d.field, status: "Open" },
    });
    if (openExisting) {
      if (openExisting.incomingValue !== d.incomingValue) {
        await db.conflict.update({ where: { id: openExisting.id }, data: { incomingValue: d.incomingValue, detectedAt: new Date() } });
      }
      continue;
    }
    await db.conflict.create({
      data: {
        type: "SOURCE_CHANGED", matchedUuid: existing.uuid, sourceKey: row.sourceKey,
        field: d.field, masterValue: d.masterValue, incomingValue: d.incomingValue,
      },
    });
    stats.sourceChangedDetected++;
  }
}

async function getSetting(key: string, def: string): Promise<string> {
  const s = await db.setting.findUnique({ where: { key } });
  return s?.value ?? def;
}

export async function getWorkflowStates(): Promise<string[]> {
  const raw = await getSetting("WORKFLOW_STATES", "Đang xử lý|Chưa onweb|Đã onweb");
  return raw.split("|").map((s) => s.trim()).filter(Boolean);
}

export async function getDoneStateName(): Promise<string> {
  const explicit = await getSetting("DONE_STATE_NAME", "");
  if (explicit) return explicit;
  const states = await getWorkflowStates();
  return states[states.length - 1];
}

async function getFirstState(): Promise<string> {
  const states = await getWorkflowStates();
  return states[0];
}
