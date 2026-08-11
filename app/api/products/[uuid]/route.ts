// app/api/products/[uuid]/route.ts — cập nhật CÓ KIỂM SOÁT.
//
// "Nhân sự" KHÔNG nhận từ body nữa (quyết định #5) — tự lấy người đang đăng nhập
// (session cookie) và tự gán vào đúng vai trò khi họ sửa field trong nhóm tương ứng:
//   sửa field nhóm Khai báo (state/ghiChu)      -> Assignment role=KHAI_BAO
//   sửa field nhóm Bài viết (baiViet*/slider)   -> Assignment role=BAI_VIET
//   sửa field nhóm Video (video*)               -> Assignment role=VIDEO
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDoneStateName, getWorkflowStates } from "@/lib/sync";
import { getSessionUser, displayName } from "@/lib/auth";

const STATIC_STRING_FIELDS = [
  "id", // nhóm CMS
  "maModel", "maBienThe", // nhóm PIM
  "ghiChu", // nhóm Khai báo sản phẩm
  "baiVietSiteDmx", "baiVietSiteTgdd", "slider", // nhóm Bài viết
  "videoNoiDungDeXuat", "videoLink", // nhóm Video
] as const;

// field -> vai trò Nhân sự tự động gán khi field đó bị sửa (quyết định #5).
const FIELD_TO_ROLE: Record<string, "KHAI_BAO" | "BAI_VIET" | "VIDEO"> = {
  ghiChu: "KHAI_BAO", state: "KHAI_BAO",
  baiVietSiteDmx: "BAI_VIET", baiVietSiteTgdd: "BAI_VIET", slider: "BAI_VIET",
  videoNoiDungDeXuat: "VIDEO", videoLink: "VIDEO", videoNgayUp: "VIDEO",
};

export async function PATCH(req: NextRequest, { params }: { params: { uuid: string } }) {
  const { uuid } = params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const user = displayName(sessionUser);

  const body = await req.json();
  const product = await db.product.findUnique({ where: { uuid }, include: { workflow: true } });
  if (!product) return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });

  const historyEntries: { field: string; oldValue: string; newValue: string; changedBy: string; changeType: string }[] = [];
  const data: Record<string, unknown> = {};
  const rolesTouched = new Set<"KHAI_BAO" | "BAI_VIET" | "VIDEO">();

  if (typeof body.id === "string" && body.id !== (product.id ?? "")) {
    const dup = body.id ? await db.product.findFirst({ where: { id: body.id, uuid: { not: uuid } } }) : null;
    if (dup) return NextResponse.json({ error: `ID "${body.id}" đã được dùng cho sản phẩm khác` }, { status: 409 });
  }

  for (const field of STATIC_STRING_FIELDS) {
    if (typeof body[field] !== "string") continue;
    const oldVal = (product as any)[field] ?? "";
    const newVal = body[field];
    if (newVal === oldVal) continue;
    data[field] = newVal || null;
    historyEntries.push({ field, oldValue: oldVal, newValue: newVal, changedBy: user, changeType: "FIELD_UPDATE_APPROVED" });
    if (FIELD_TO_ROLE[field]) rolesTouched.add(FIELD_TO_ROLE[field]);
  }

  // ID phiên bản — mảng, người dùng gõ cách nhau bởi dấu phẩy/xuống dòng ở FE, BE nhận mảng sẵn.
  if (Array.isArray(body.idPhienBanList)) {
    const newList = body.idPhienBanList.map((s: string) => String(s).trim()).filter(Boolean);
    const oldList = product.idPhienBanList ?? [];
    if (JSON.stringify(newList) !== JSON.stringify(oldList)) {
      data.idPhienBanList = newList;
      historyEntries.push({ field: "IdPhienBanList", oldValue: oldList.join(", "), newValue: newList.join(", "), changedBy: user, changeType: "FIELD_UPDATE_APPROVED" });
    }
  }

  if (Array.isArray(body.siteKinhDoanh)) {
    const newSites = body.siteKinhDoanh.map((s: string) => String(s).trim()).filter(Boolean);
    const oldSites = product.siteKinhDoanh ?? [];
    if (JSON.stringify(newSites) !== JSON.stringify(oldSites)) {
      data.siteKinhDoanh = newSites;
      historyEntries.push({ field: "SiteKinhDoanh", oldValue: oldSites.join(", "), newValue: newSites.join(", "), changedBy: user, changeType: "FIELD_UPDATE_APPROVED" });
    }
  }

  if (typeof body.videoNgayUp === "string") {
    const newDate = body.videoNgayUp ? new Date(body.videoNgayUp) : null;
    const oldDate = product.videoNgayUp ? product.videoNgayUp.toISOString().slice(0, 10) : "";
    const newStr = newDate ? newDate.toISOString().slice(0, 10) : "";
    if (newStr !== oldDate) {
      data.videoNgayUp = newDate;
      historyEntries.push({ field: "VideoNgayUp", oldValue: oldDate, newValue: newStr, changedBy: user, changeType: "FIELD_UPDATE_APPROVED" });
      rolesTouched.add("VIDEO");
    }
  }

  if (Object.keys(data).length) {
    await db.product.update({ where: { uuid }, data });
  }

  // --- Trạng thái workflow (nhóm Khai báo sản phẩm) ---
  if (typeof body.state === "string" && product.workflow && body.state !== product.workflow.state) {
    const states = await getWorkflowStates();
    if (!states.includes(body.state)) {
      return NextResponse.json({ error: `Trạng thái không hợp lệ: ${body.state}` }, { status: 400 });
    }
    const doneState = await getDoneStateName();
    const ngayOnweb = body.state === doneState && !product.workflow.ngayOnweb ? new Date() : product.workflow.ngayOnweb;
    await db.workflow.update({ where: { uuid }, data: { state: body.state, stateEnteredAt: new Date(), ngayOnweb } });
    historyEntries.push({ field: "WORKFLOW_STATE", oldValue: product.workflow.state, newValue: body.state, changedBy: user, changeType: "WORKFLOW_TRANSITION" });
    rolesTouched.add("KHAI_BAO");
  }

  // --- Tự gán "Nhân sự" theo người đang đăng nhập cho mọi vai trò vừa bị đụng tới ---
  for (const role of rolesTouched) {
    const existing = await db.assignment.findFirst({ where: { uuid, role, status: { in: ["Confirmed"] } } });
    if (!existing || existing.maNV !== sessionUser.maNV) {
      // Ghi đè dòng 'Suggested' cũ (nếu có) hoặc dòng Confirmed của người khác bằng dòng mới của mình.
      await db.assignment.updateMany({ where: { uuid, role }, data: { status: "Dismissed" } });
      await db.assignment.create({
        data: { uuid, role, maNV: sessionUser.maNV, userName: user, status: "Confirmed" },
      });
      historyEntries.push({ field: `NhanSu_${role}`, oldValue: existing?.userName ?? "", newValue: user, changedBy: user, changeType: "ASSIGNMENT_CHANGE" });
    }
  }

  if (historyEntries.length) {
    await db.history.createMany({ data: historyEntries.map((h) => ({ ...h, uuid })) });
  }

  const updated = await db.product.findUnique({ where: { uuid }, include: { workflow: true, assignments: true } });
  return NextResponse.json({ product: updated });
}
