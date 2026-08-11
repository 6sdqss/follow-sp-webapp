"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [maNV, setMaNV] = useState("");
  const [tenNV, setTenNV] = useState("");
  const [needName, setNeedName] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maNV, tenNV: needName ? tenNV : undefined }),
      });
      const data = await res.json();
      if (data.needName) {
        setNeedName(true);
        return;
      }
      if (data.ok) {
        router.push("/products");
        router.refresh();
      } else {
        setError(data.error || "Có lỗi xảy ra");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>📦 FOLLOW SP ONWEB</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>Nhập Mã NV để vào — không cần mật khẩu.</p>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          placeholder="Mã NV (ví dụ: 234776)"
          value={maNV}
          onChange={(e) => setMaNV(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
          autoFocus
        />
        {needName && (
          <>
            <p style={{ fontSize: 13, color: "#B45309", margin: 0 }}>
              Mã NV này chưa có trong hệ thống — nhập Tên để đăng ký lần đầu:
            </p>
            <input
              placeholder="Họ tên"
              value={tenNV}
              onChange={(e) => setTenNV(e.target.value)}
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
            />
          </>
        )}
        {error && <p style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || !maNV}
          style={{ padding: 10, background: "#0B57D0", color: "white", border: "none", borderRadius: 6, fontSize: 14, cursor: "pointer" }}
        >
          {loading ? "Đang xử lý..." : needName ? "Đăng ký & Vào" : "Vào"}
        </button>
      </form>
    </main>
  );
}
