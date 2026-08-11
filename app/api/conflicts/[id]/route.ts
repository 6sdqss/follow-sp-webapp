// app/api/conflicts/[id]/route.ts — xác nhận áp dụng hoặc bỏ qua 1 badge "nguồn đã đổi".
// CHỈ áp dụng field nằm trong nhóm sync được phép ghi (TenSanPham/NganhHang/Specs/LinkHinh) —
// đúng đối tượng mà lib/sync.ts đã so sánh khi tạo Conflict này.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, displayName } from "@/lib/auth";

const FIELD_TO_COLUMN: Record<string, string> = {
  TenSanPham: "tenSanPham", NganhHang: "nganhHang", Specs: "specs", LinkHinh: "linkHinh",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const user = displayName(sessionUser);

  const { action } = await req.json(); // 'apply' | 'dismiss'
  const conflict = await db.conflict.findUnique({ where: { id: params.id } });
  if (!conflict || conflict.status !== "Open") {
    return NextResponse.json({ error: "Không tìm thấy hoặc đã xử lý rồi" }, { status: 404 });
  }

  if (action === "apply" && conflict.matchedUuid && conflict.field) {
    const column = FIELD_TO_COLUMN[conflict.field];
    if (column) {
      await db.product.update({
        where: { uuid: conflict.matchedUuid },
        data: { [column]: conflict.incomingValue },
      });
      await db.history.create({
        data: {
          uuid: conflict.matchedUuid, field: conflict.field,
          oldValue: conflict.masterValue, newValue: conflict.incomingValue,
          changedBy: user, changeType: "FIELD_UPDATE_APPROVED",
        },
      });
    }
  }

  await db.conflict.update({
    where: { id: params.id },
    data: { status: action === "apply" ? "Applied" : "Dismissed", resolvedBy: user, resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
