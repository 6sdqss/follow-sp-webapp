// app/api/conflicts/route.ts — danh sách badge "nguồn đã đổi" (SOURCE_CHANGED) đang mở,
// gom theo uuid để FE biết sản phẩm nào cần hiện badge (quyết định #9).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const conflicts = await db.conflict.findMany({
    where: { type: "SOURCE_CHANGED", status: "Open" },
    orderBy: { detectedAt: "desc" },
  });
  return NextResponse.json({ conflicts });
}
