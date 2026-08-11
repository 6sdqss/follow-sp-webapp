// components/TopNav.tsx — thanh điều hướng chung, gradient tím-xanh cho nổi bật (yêu cầu UI/UX đẹp).
import Link from "next/link";

export default function TopNav({ active, user }: { active: "products" | "dashboard"; user: string | null }) {
  return (
    <div
      style={{
        background: "linear-gradient(90deg, #6238e5 0%, #0B57D0 100%)",
        padding: "14px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        color: "white",
        boxShadow: "0 2px 8px rgba(98,56,229,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.3 }}>📦 FOLLOW SP ONWEB</span>
        <nav style={{ display: "flex", gap: 4 }}>
          <NavLink href="/products" label="Quản lý SP" activeIcon="📋" isActive={active === "products"} />
          <NavLink href="/dashboard" label="Dashboard" activeIcon="📊" isActive={active === "dashboard"} />
        </nav>
      </div>
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ opacity: 0.9 }}>👤 {user}</span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
            >
              Đăng xuất
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function NavLink({ href, label, activeIcon, isActive }: { href: string; label: string; activeIcon: string; isActive: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: 600,
        textDecoration: "none",
        color: "white",
        background: isActive ? "rgba(255,255,255,0.22)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      {activeIcon} {label}
    </Link>
  );
}
