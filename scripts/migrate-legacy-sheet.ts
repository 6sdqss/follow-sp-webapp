// scripts/migrate-legacy-sheet.ts
// Chạy 1 LẦN DUY NHẤT để mang TOÀN BỘ dữ liệu từ hệ mini-PIM Apps Script cũ
// (_MASTER_PRODUCT / _WORKFLOW / _ASSIGNMENT / _HISTORY trong sheet ẩn) sang Postgres.
// Giữ NGUYÊN UUID cũ để lịch sử/liên kết không bị đứt gãy.
//
// CÁCH DÙNG (đọc qua LINK CÔNG KHAI — không cần Google Cloud Console/Service Account):
//   1) Trong Google Sheet chứa hệ mini-PIM cũ: chuột phải thanh tab -> "Hiện sheet ẩn".
//   2) File -> Chia sẻ -> đổi thành "Anyone with the link - Viewer" (tạm thời, có thể tắt lại
//      sau khi migrate xong).
//   3) Click vào TỪNG tab hệ thống (_MASTER_PRODUCT, _WORKFLOW, _ASSIGNMENT, _HISTORY),
//      copy số đứng sau "gid=" trên URL của mỗi tab.
//   4) Set trong .env: LEGACY_SPREADSHEET_ID + 4 biến LEGACY_*_GID tương ứng.
//   5) npm run migrate-legacy
//
// Script AN TOÀN chạy lại nhiều lần: dùng upsert theo UUID, không tạo trùng.

import "dotenv/config";
import Papa from "papaparse";
import { db } from "../lib/db";
import { parseDateFlexible } from "../lib/normalize";

async function readSheetByGid(spreadsheetId: string, gid: string): Promise<unknown[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không đọc được gid=${gid}: HTTP ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith("<")) {
    throw new Error(`gid=${gid} chưa public — kiểm tra lại chế độ chia sẻ Sheet.`);
  }
  return Papa.parse<string[]>(text, { skipEmptyLines: false }).data as unknown[][];
}

function s(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

async function main() {
  const spreadsheetId = process.env.LEGACY_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("Thiếu biến môi trường LEGACY_SPREADSHEET_ID");
  const masterGid = process.env.LEGACY_MASTER_GID;
  const workflowGid = process.env.LEGACY_WORKFLOW_GID;
  const assignmentGid = process.env.LEGACY_ASSIGNMENT_GID;
  const historyGid = process.env.LEGACY_HISTORY_GID;
  if (!masterGid || !workflowGid || !assignmentGid || !historyGid) {
    throw new Error("Thiếu 1 trong 4 biến LEGACY_MASTER_GID / LEGACY_WORKFLOW_GID / LEGACY_ASSIGNMENT_GID / LEGACY_HISTORY_GID");
  }

  console.log("== 1/4: Đọc _MASTER_PRODUCT ==");
  // Cột theo đúng thứ tự MASTER_COLS trong master.gs cũ (dòng 1 = header, bỏ qua):
  // UUID, ID, ERP, TenSanPham, NganhHang, NgayOrder, NguonGoc, Specs, LinkHinh, PicNguon,
  // WatchedFieldsHash, Status, CreatedAt, CreatedBy, LastVerifiedAt, GhiChu
  const masterRows = (await readSheetByGid(spreadsheetId, masterGid)).slice(1).filter((r) => r.some((c) => c));
  console.log(`  -> ${masterRows.length} sản phẩm`);

  console.log("== 2/4: Đọc _WORKFLOW ==");
  // UUID, CurrentState, StateEnteredAt, Deadline, Priority, SLA_Status, NgayOnweb
  const workflowRows = (await readSheetByGid(spreadsheetId, workflowGid)).slice(1).filter((r) => r.some((c) => c));
  const workflowByUuid = new Map(workflowRows.map((r) => [s(r[0]), r]));
  console.log(`  -> ${workflowRows.length} dòng workflow`);

  console.log("== 3/4: Đọc _ASSIGNMENT ==");
  // AssignmentID, UUID, Role, UserName, AssignedAt, AssignedBy, AssignmentStatus
  const assignmentRows = (await readSheetByGid(spreadsheetId, assignmentGid)).slice(1).filter((r) => r.some((c) => c));
  const assignmentsByUuid = new Map<string, unknown[][]>();
  for (const r of assignmentRows) {
    const uuid = s(r[1]);
    if (!assignmentsByUuid.has(uuid)) assignmentsByUuid.set(uuid, []);
    assignmentsByUuid.get(uuid)!.push(r);
  }

  console.log("== 4/4: Đọc _HISTORY ==");
  // HistoryID, UUID, Field, OldValue, NewValue, ChangedBy, ChangedAt, ChangeType
  const historyRows = (await readSheetByGid(spreadsheetId, historyGid)).slice(1).filter((r) => r.some((c) => c));
  const historyByUuid = new Map<string, unknown[][]>();
  for (const r of historyRows) {
    const uuid = s(r[1]);
    if (!historyByUuid.has(uuid)) historyByUuid.set(uuid, []);
    historyByUuid.get(uuid)!.push(r);
  }

  let migrated = 0;
  for (const row of masterRows) {
    const uuid = s(row[0]);
    if (!uuid) continue;

    await db.product.upsert({
      where: { uuid },
      update: {}, // đã tồn tại (chạy lại script) -> không đè, an toàn tuyệt đối
      create: {
        uuid,
        id: s(row[1]) || null,
        erp: s(row[2]) || null,
        tenSanPham: s(row[3]) || "(chưa có tên)",
        nganhHang: s(row[4]) || null,
        ngayOrder: parseDateFlexible(row[5]),
        nguonGoc: (["LT", "CE", "GD"].includes(s(row[6])) ? s(row[6]) : "CE") as any,
        specs: s(row[7]) || null,
        linkHinh: s(row[8]) || null,
        watchedFieldsHash: s(row[10]) || null,
        status: s(row[11]) === "Archived" ? "Archived" : "Active",
        createdAt: parseDateFlexible(row[12]) ?? new Date(),
        createdBy: s(row[13]) || "MIGRATED",
        lastVerifiedAt: parseDateFlexible(row[14]) ?? new Date(),
        ghiChu: s(row[15]),
        // linkBaiViet: chưa có ở hệ cũ -> để trống, anh điền dần trong web app mới.
      },
    });

    const wf = workflowByUuid.get(uuid);
    if (wf) {
      // Map 8 state cũ -> 3 state mới đã chốt (Đang xử lý / Chưa onweb / Đã onweb).
      // Bỏ hẳn Priority/Deadline/SLA — không còn trong schema mới.
      const oldState = s(wf[1]);
      const newState = oldState === "Đã Onweb" ? "Đã onweb"
        : oldState === "Mới" ? "Đang xử lý"
        : "Chưa onweb";
      await db.workflow.upsert({
        where: { uuid },
        update: {},
        create: {
          uuid,
          state: newState,
          stateEnteredAt: parseDateFlexible(wf[2]) ?? new Date(),
          ngayOnweb: parseDateFlexible(wf[6]),
        },
      });
    }

    // Role cũ chỉ có 'PIC' -> map sang 'KHAI_BAO' (vai trò gần nghĩa nhất trong 3 vai trò mới).
    // maNV để trống vì dữ liệu cũ không có Mã NV — chỉ có tên hiển thị.
    const assigns = assignmentsByUuid.get(uuid) ?? [];
    for (const a of assigns) {
      const role = s(a[2]) === "PIC" ? "KHAI_BAO" : s(a[2]);
      const userName = s(a[3]);
      const exists = await db.assignment.findFirst({ where: { uuid, role, userName } });
      if (!exists && userName) {
        await db.assignment.create({
          data: {
            uuid, role, userName,
            assignedAt: parseDateFlexible(a[4]) ?? new Date(),
            status: "Confirmed",
          },
        });
      }
    }

    const hist = historyByUuid.get(uuid) ?? [];
    if (hist.length) {
      await db.history.createMany({
        data: hist.map((h) => ({
          uuid,
          field: s(h[2]),
          oldValue: s(h[3]),
          newValue: s(h[4]),
          changedBy: s(h[5]) || "MIGRATED",
          changedAt: parseDateFlexible(h[6]) ?? new Date(),
          changeType: s(h[7]) || "MIGRATED",
        })),
        skipDuplicates: true,
      });
    }

    migrated++;
    if (migrated % 200 === 0) console.log(`  ... đã migrate ${migrated}/${masterRows.length}`);
  }

  console.log(`\n✅ XONG. Đã migrate ${migrated} sản phẩm (kèm workflow/assignment/history) sang Postgres.`);
  console.log("Kiểm tra lại số lượng: SELECT count(*) FROM \"Product\"; trong Postgres.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
