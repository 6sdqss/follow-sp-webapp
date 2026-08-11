import { getDashboardStats } from "@/lib/dashboardStats";
import { getSessionUser, displayName } from "@/lib/auth";
import TopNav from "@/components/TopNav";

export const dynamic = "force-dynamic";

const NGANH_COLORS = ["#6238e5", "#0B57D0", "#0F9D58", "#F4B400", "#DB4437", "#00ACC1", "#8E24AA", "#546E7A"];

export default async function DashboardPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  const sessionUser = await getSessionUser();
  const year = searchParams.year ? Number(searchParams.year) : undefined;
  const month = searchParams.month ? Number(searchParams.month) : undefined;
  const stats = await getDashboardStats({ year, month });

  const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
  const overallPct = pct(stats.totalDone, stats.totalOrder);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", background: "#F5F6FA", minHeight: "100vh" }}>
      <TopNav active="dashboard" user={sessionUser ? displayName(sessionUser) : null} />

      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, background: "linear-gradient(90deg,#6238e5,#0B57D0)", WebkitBackgroundClip: "text", color: "transparent" }}>
              📊 Dashboard — Chỉ CE & GD
            </h1>
            <p style={{ color: "#6B7280", fontSize: 13, margin: "4px 0 0" }}>Không tính LƯU TRỮ GỐC (LT) theo yêu cầu.</p>
          </div>

          <form style={{ display: "flex", gap: 8 }}>
            <select name="year" defaultValue={year ?? ""} style={filterSelectStyle}>
              <option value="">Tất cả năm</option>
              {stats.availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select name="month" defaultValue={month ?? ""} style={filterSelectStyle}>
              <option value="">Cả năm</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <button type="submit" style={{ padding: "8px 16px", background: "#6238e5", color: "white", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Lọc
            </button>
          </form>
        </div>

        {/* ---- Thẻ tổng quan ---- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          <StatCard label="Tổng Order (CE+GD)" value={stats.totalOrder} color="#0B57D0" icon="📦" />
          <StatCard label="Đã Onweb" value={stats.totalDone} color="#0F9D58" icon="✅" />
          <StatCard label="Chưa Onweb" value={stats.totalOrder - stats.totalDone} color="#DB4437" icon="⏳" />
          <StatCard label="% Hoàn thành" value={`${overallPct}%`} color="#6238e5" icon="🎯" progress={overallPct} />
        </div>

        {/* ---- Theo nguồn CE vs GD ---- */}
        <SectionCard title="Theo nguồn">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {stats.bySource.map((s) => {
              const p = pct(s.done, s.total);
              return (
                <div key={s.source} style={{ padding: 16, borderRadius: 12, background: s.source === "CE" ? "#EEF2FF" : "#FFF7ED", border: `1px solid ${s.source === "CE" ? "#C7D2FE" : "#FED7AA"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <b style={{ fontSize: 15 }}>{s.source === "CE" ? "🔵 Order CE" : "🟠 Order GD"}</b>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>{s.total} sản phẩm</span>
                  </div>
                  <ProgressBar percent={p} color={s.source === "CE" ? "#4F46E5" : "#EA580C"} />
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>{s.done}/{s.total} đã onweb ({p}%)</div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* ---- Theo ngành hàng ---- */}
        <SectionCard title="Theo Ngành hàng">
          {stats.byNganhHang.length === 0 && <p style={{ color: "#9CA3AF", fontSize: 13 }}>Không có dữ liệu trong kỳ đang lọc.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stats.byNganhHang.map((n, i) => {
              const p = pct(n.done, n.total);
              return (
                <div key={n.nganhHang} style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.nganhHang}</span>
                  <ProgressBar percent={p} color={NGANH_COLORS[i % NGANH_COLORS.length]} />
                  <span style={{ fontSize: 12, color: "#6B7280", textAlign: "right" }}>{n.done}/{n.total} ({p}%)</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

function StatCard({ label, value, color, icon, progress }: { label: string; value: number | string; color: string; icon: string; progress?: number }) {
  return (
    <div style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, margin: "4px 0" }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "#6B7280" }}>{label}</div>
      {progress !== undefined && (
        <div style={{ marginTop: 8 }}><ProgressBar percent={progress} color={color} thin /></div>
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>{title}</h2>
      {children}
    </div>
  );
}

function ProgressBar({ percent, color, thin }: { percent: number; color: string; thin?: boolean }) {
  return (
    <div style={{ background: "#F1F3F4", borderRadius: 999, height: thin ? 6 : 10, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(percent, 100)}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.3s" }} />
    </div>
  );
}

const filterSelectStyle: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, background: "white",
};
