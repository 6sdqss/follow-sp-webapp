// app/api/cron/sync/route.ts — endpoint Vercel Cron gọi theo lịch (xem vercel.json).
// Bảo vệ bằng CRON_SECRET để không ai gọi tay từ bên ngoài kích hoạt sync bừa bãi.
import { NextRequest, NextResponse } from "next/server";
import { runIncrementalSync } from "@/lib/sync";

export const maxDuration = 60; // Vercel Pro cho phép tới 300s nếu cần dữ liệu lớn hơn

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stats = await runIncrementalSync("Auto-Cron");
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
