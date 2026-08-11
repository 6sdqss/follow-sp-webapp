import { db } from "@/lib/db";
import { getSessionUser, displayName } from "@/lib/auth";
import ProductsTable from "@/components/ProductsTable";
import TopNav from "@/components/TopNav";

export const dynamic = "force-dynamic"; // luôn đọc dữ liệu mới nhất

export default async function ProductsPage() {
  const sessionUser = await getSessionUser();

  // Sản phẩm MỚI luôn ở trên đầu (quyết định #8) -> sort theo createdAt desc, không theo Ngày Order.
  const [products, openConflicts] = await Promise.all([
    db.product.findMany({
      where: { status: "Active" },
      include: { workflow: true, assignments: { where: { status: "Confirmed" } } },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    }),
    db.conflict.findMany({ where: { type: "SOURCE_CHANGED", status: "Open" } }),
  ]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", background: "#F5F6FA", minHeight: "100vh" }}>
      <TopNav active="products" user={sessionUser ? displayName(sessionUser) : null} />
      <div style={{ padding: "24px 32px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px", color: "#1F2937" }}>📋 Quản lý sản phẩm</h1>
        <p style={{ color: "#6B7280", marginBottom: 16, fontSize: 13 }}>
          Sản phẩm mới đồng bộ luôn nằm trên đầu. <span style={{ background: "#FFFDE7", padding: "1px 6px", borderRadius: 4 }}>Nền vàng</span> = sửa được, tự lưu, tự gán "Nhân sự" theo
          người đang đăng nhập. Badge 🔶 = dữ liệu ở Order CE/GD đã đổi khác hệ thống — bấm để xem &
          xác nhận, hệ thống không tự áp dụng.
        </p>
        <ProductsTable
          initialProducts={JSON.parse(JSON.stringify(products))}
          initialConflicts={JSON.parse(JSON.stringify(openConflicts))}
        />
      </div>
    </main>
  );
}
