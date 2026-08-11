// app/api/auth/login/route.ts — đăng nhập/tự đăng ký chỉ bằng Mã NV.
import { NextRequest, NextResponse } from "next/server";
import { loginOrRegister, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { maNV, tenNV } = await req.json();
  if (!maNV || typeof maNV !== "string") {
    return NextResponse.json({ error: "Thiếu Mã NV" }, { status: 400 });
  }
  try {
    const result = await loginOrRegister(maNV, tenNV);
    if (!result.ok) {
      return NextResponse.json({ needName: true }, { status: 200 });
    }
    setSessionCookie(result.user.maNV);
    return NextResponse.json({ ok: true, user: result.user });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
