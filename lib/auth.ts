// lib/auth.ts — đăng nhập CHỈ bằng Mã NV, không mật khẩu (quyết định #7).
// Lần đầu gõ Mã NV chưa có trong hệ thống -> bắt buộc kèm Tên -> tự tạo Staff mới.
// Lần sau chỉ cần Mã NV -> tự nhận diện. Session lưu bằng cookie ký đơn giản (không cần
// thư viện auth nặng vì đây là công cụ nội bộ team, không phải hệ thống công khai).
import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { db } from "./db";

const COOKIE_NAME = "fsp_session";
const SECRET = process.env.CRON_SECRET || "fallback-dev-secret"; // dùng lại CRON_SECRET cho gọn .env

function sign(maNV: string): string {
  const sig = createHmac("sha256", SECRET).update(maNV).digest("hex").slice(0, 16);
  return `${maNV}.${sig}`;
}

function verify(token: string): string | null {
  const [maNV, sig] = token.split(".");
  if (!maNV || !sig) return null;
  return sign(maNV) === token ? maNV : null;
}

export type SessionUser = { maNV: string; tenNV: string };

/** Đăng nhập hoặc tự đăng ký — dùng trong app/api/auth/login/route.ts */
export async function loginOrRegister(maNV: string, tenNV?: string): Promise<
  { ok: true; user: SessionUser } | { ok: false; needName: true }
> {
  const code = maNV.trim();
  if (!code) throw new Error("Thiếu Mã NV");

  const existing = await db.staff.findUnique({ where: { maNV: code } });
  if (existing) {
    await db.staff.update({ where: { maNV: code }, data: { lastLogin: new Date() } });
    return { ok: true, user: { maNV: code, tenNV: existing.tenNV } };
  }

  if (!tenNV?.trim()) {
    // Mã NV chưa từng thấy -> yêu cầu FE hỏi thêm Tên trước khi tạo mới.
    return { ok: false, needName: true };
  }

  const created = await db.staff.create({ data: { maNV: code, tenNV: tenNV.trim() } });
  return { ok: true, user: { maNV: code, tenNV: created.tenNV } };
}

export function setSessionCookie(maNV: string) {
  cookies().set(COOKIE_NAME, sign(maNV), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90, // 90 ngày — công cụ nội bộ, không cần đăng nhập lại liên tục
    path: "/",
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

/** Dùng trong Server Component / API route để lấy người đang đăng nhập. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const maNV = verify(token);
  if (!maNV) return null;
  const staff = await db.staff.findUnique({ where: { maNV } });
  if (!staff) return null;
  return { maNV: staff.maNV, tenNV: staff.tenNV };
}

/** Chuỗi hiển thị chuẩn "TÊN - MÃ NV" giống format sheet cũ (quyết định #đầu). */
export function displayName(u: SessionUser): string {
  return `${u.tenNV.toUpperCase()} - ${u.maNV}`;
}
