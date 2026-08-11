// app/api/products/route.ts — GET danh sách (có filter/search), dùng cho bảng QUẢN LÝ SP mới.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const nganh = searchParams.get("nganh");
  const state = searchParams.get("state");
  const nguon = searchParams.get("nguon");
  const pic = searchParams.get("pic");

  const products = await db.product.findMany({
    where: {
      status: "Active",
      ...(nganh && nganh !== "ALL" ? { nganhHang: nganh } : {}),
      ...(nguon && nguon !== "ALL" ? { nguonGoc: nguon as any } : {}),
      ...(q
        ? {
            OR: [
              { tenSanPham: { contains: q, mode: "insensitive" } },
              { erp: { contains: q, mode: "insensitive" } },
              { id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(state && state !== "ALL" ? { workflow: { state } } : {}),
      ...(pic && pic !== "ALL" ? { assignments: { some: { role: "PIC", userName: pic } } } : {}),
    },
    include: { workflow: true, assignments: true },
    orderBy: [{ ngayOrder: "desc" }],
    take: 500,
  });

  return NextResponse.json({ products });
}
