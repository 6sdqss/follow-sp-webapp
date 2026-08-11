"use client";

import { useRef, useState } from "react";

type Assignment = { role: string; userName: string };
type ConflictRow = {
  id: string; matchedUuid: string | null; field: string | null;
  masterValue: string | null; incomingValue: string | null;
};
type Product = {
  uuid: string;
  erp: string | null;
  tenSanPham: string;
  nganhHang: string | null;
  ngayOrder: string | null;
  nguonGoc: string;
  siteKinhDoanh: string[];
  id: string | null;
  idPhienBanList: string[];
  maModel: string | null;
  maBienThe: string | null;
  specs: string | null;
  ghiChu: string | null;
  baiVietSiteDmx: string | null;
  baiVietSiteTgdd: string | null;
  slider: string | null;
  videoNoiDungDeXuat: string | null;
  videoLink: string | null;
  videoNgayUp: string | null;
  workflow: { state: string; ngayOnweb: string | null } | null;
  assignments: Assignment[];
};

const STATE_OPTIONS = ["Đang xử lý", "Chưa onweb", "Đã onweb"];
const SITE_OPTIONS = ["TGDD", "DMX"];

const EDITABLE_BG = "#FFFDE7"; // sửa được, tự lưu
const READONLY_BG = "#FAFAFA"; // do sync quản lý
const AUTO_BG = "#F3F4F6"; // tự động theo người đăng nhập, không sửa trực tiếp ở đây

function linkWebFromId(id: string | null): string {
  return id ? `https://www.dienmayxanh.com/sp-${id}` : "";
}
function linkCmsFromId(id: string | null): string {
  return id ? `https://cms.thegioididong.com/Product/Edit?productID=${id}&site=2` : "";
}

export default function ProductsTable({
  initialProducts, initialConflicts,
}: { initialProducts: Product[]; initialConflicts: ConflictRow[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [conflicts, setConflicts] = useState(initialConflicts);
  const [savingUuid, setSavingUuid] = useState<string | null>(null);
  const [openBadge, setOpenBadge] = useState<string | null>(null); // uuid đang mở popover badge
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function localUpdate(uuid: string, patch: Record<string, unknown>) {
    setProducts((prev) => prev.map((p) => {
      if (p.uuid !== uuid) return p;
      const next: any = { ...p };
      for (const k of Object.keys(patch)) {
        if (k === "state" && p.workflow) next.workflow = { ...p.workflow, state: patch.state };
        else next[k] = patch[k];
      }
      return next;
    }));
  }

  function scheduleSave(uuid: string, patch: Record<string, unknown>) {
    localUpdate(uuid, patch);
    clearTimeout(timers.current[uuid]);
    timers.current[uuid] = setTimeout(() => save(uuid, patch), 600);
  }

  async function save(uuid: string, patch: Record<string, unknown>) {
    setSavingUuid(uuid);
    try {
      const res = await fetch(`/api/products/${uuid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Lỗi khi lưu: " + (err.error || res.statusText));
      }
    } catch (e) {
      alert("Lỗi kết nối khi lưu: " + String(e));
    } finally {
      setSavingUuid(null);
    }
  }

  async function resolveConflict(id: string, action: "apply" | "dismiss") {
    const res = await fetch(`/api/conflicts/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setConflicts((prev) => prev.filter((c) => c.id !== id));
      if (action === "apply") window.location.reload(); // đơn giản: reload để lấy dữ liệu mới nhất
    }
  }

  function picOf(p: Product, role: string) {
    return p.assignments.find((a) => a.role === role)?.userName ?? "(chưa có)";
  }
  function conflictsOf(uuid: string) {
    return conflicts.filter((c) => c.matchedUuid === uuid);
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 2000 }}>
        <thead>
          <tr style={{ background: "#0B57D0", color: "white" }}>
            <Group label="THÔNG TIN CƠ BẢN" span={6} />
            <Group label="CMS" span={4} />
            <Group label="PIM" span={2} />
            <Group label="SPECS/FOLDER" span={1} />
            <Group label="KHAI BÁO SẢN PHẨM" span={3} />
            <Group label="BÀI VIẾT" span={4} />
            <Group label="VIDEO" span={4} />
          </tr>
          <tr style={{ background: "#E8EAED" }}>
            {[
              "Site kinh doanh", "Ngày Order", "Nguồn", "Ngành hàng", "Code ERP", "Tên sản phẩm",
              "ID", "ID phiên bản", "Link Web", "Link CMS",
              "Mã Model", "Mã biến thể",
              "Link Folder",
              "Trạng thái", "Ngày onweb", "Nhân sự KB",
              "Bài viết DMX", "Bài viết TGDD", "Slider", "Nhân sự BV",
              "Nội dung đề xuất", "Link", "Ngày up", "Nhân sự Video",
            ].map((h) => (
              <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap", fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const isSaving = savingUuid === p.uuid;
            const myConflicts = conflictsOf(p.uuid);
            return (
              <tr key={p.uuid} style={{ borderTop: "1px solid #eee", opacity: isSaving ? 0.6 : 1 }}>
                <Cell readonly>
                  <select multiple value={p.siteKinhDoanh} style={{ ...inputStyle(true), height: 26 }}
                    onChange={(e) => scheduleSave(p.uuid, { siteKinhDoanh: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
                    {SITE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Cell>
                <Cell readonly>{p.ngayOrder ? new Date(p.ngayOrder).toLocaleDateString("vi-VN") : ""}</Cell>
                <Cell readonly>{p.nguonGoc}</Cell>
                <Cell readonly>{p.nganhHang}</Cell>
                <Cell readonly>{p.erp}</Cell>
                <Cell readonly maxWidth={220}>
                  {p.tenSanPham}
                  {myConflicts.length > 0 && (
                    <span style={{ position: "relative", marginLeft: 6 }}>
                      <button
                        onClick={() => setOpenBadge(openBadge === p.uuid ? null : p.uuid)}
                        title="Nguồn đã đổi khác hệ thống — bấm để xem"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
                      >🔶</button>
                      {openBadge === p.uuid && (
                        <div style={{ position: "absolute", top: 20, left: 0, zIndex: 10, background: "white", border: "1px solid #ddd", borderRadius: 6, padding: 10, width: 280, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                          {myConflicts.map((c) => (
                            <div key={c.id} style={{ marginBottom: 8, fontSize: 12 }}>
                              <b>{c.field}</b><br />
                              <span style={{ color: "#B91C1C" }}>Hệ thống: {c.masterValue || "(trống)"}</span><br />
                              <span style={{ color: "#0B7A0B" }}>Nguồn mới: {c.incomingValue}</span><br />
                              <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
                                <button onClick={() => resolveConflict(c.id, "apply")} style={smallBtn("#0B57D0")}>Áp dụng</button>
                                <button onClick={() => resolveConflict(c.id, "dismiss")} style={smallBtn("#999")}>Bỏ qua</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </span>
                  )}
                </Cell>

                <Cell>
                  <input defaultValue={p.id ?? ""} style={inputStyle(true)}
                    onBlur={(e) => scheduleSave(p.uuid, { id: e.target.value.trim() })} />
                </Cell>
                <Cell>
                  <input
                    defaultValue={(p.idPhienBanList ?? []).join(", ")}
                    placeholder="cách nhau bởi dấu phẩy nếu nhiều"
                    style={inputStyle(true)}
                    onBlur={(e) => scheduleSave(p.uuid, { idPhienBanList: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
                </Cell>
                <Cell readonly>{p.id ? <a href={linkWebFromId(p.id)} target="_blank" rel="noreferrer">Xem web</a> : ""}</Cell>
                <Cell readonly>{p.id ? <a href={linkCmsFromId(p.id)} target="_blank" rel="noreferrer">Sửa CMS</a> : ""}</Cell>

                <Cell>
                  <input defaultValue={p.maModel ?? ""} style={inputStyle(true)}
                    onBlur={(e) => scheduleSave(p.uuid, { maModel: e.target.value.trim() })} />
                </Cell>
                <Cell>
                  <input defaultValue={p.maBienThe ?? ""} style={inputStyle(true)}
                    onBlur={(e) => scheduleSave(p.uuid, { maBienThe: e.target.value.trim() })} />
                </Cell>

                <Cell readonly>{p.specs ? <a href={p.specs} target="_blank" rel="noreferrer">Folder</a> : ""}</Cell>

                <Cell>
                  <select defaultValue={p.workflow?.state ?? STATE_OPTIONS[0]} style={inputStyle(true)}
                    onChange={(e) => scheduleSave(p.uuid, { state: e.target.value })}>
                    {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Cell>
                <Cell readonly>{p.workflow?.ngayOnweb ? new Date(p.workflow.ngayOnweb).toLocaleDateString("vi-VN") : ""}</Cell>
                <Cell auto title="Tự động theo người sửa gần nhất trong nhóm Khai báo">{picOf(p, "KHAI_BAO")}</Cell>

                <Cell>
                  <input defaultValue={p.baiVietSiteDmx ?? ""} placeholder="link bài viết DMX..." style={{ ...inputStyle(true), minWidth: 170 }}
                    onBlur={(e) => scheduleSave(p.uuid, { baiVietSiteDmx: e.target.value.trim() })} />
                </Cell>
                <Cell>
                  <input defaultValue={p.baiVietSiteTgdd ?? ""} placeholder="link bài viết TGDD..." style={{ ...inputStyle(true), minWidth: 170 }}
                    onBlur={(e) => scheduleSave(p.uuid, { baiVietSiteTgdd: e.target.value.trim() })} />
                </Cell>
                <Cell>
                  <input defaultValue={p.slider ?? ""} style={inputStyle(true)}
                    onBlur={(e) => scheduleSave(p.uuid, { slider: e.target.value.trim() })} />
                </Cell>
                <Cell auto title="Tự động theo người sửa gần nhất trong nhóm Bài viết">{picOf(p, "BAI_VIET")}</Cell>

                <Cell>
                  <input defaultValue={p.videoNoiDungDeXuat ?? ""} style={{ ...inputStyle(true), minWidth: 150 }}
                    onBlur={(e) => scheduleSave(p.uuid, { videoNoiDungDeXuat: e.target.value })} />
                </Cell>
                <Cell>
                  <input defaultValue={p.videoLink ?? ""} placeholder="link video..." style={{ ...inputStyle(true), minWidth: 150 }}
                    onBlur={(e) => scheduleSave(p.uuid, { videoLink: e.target.value.trim() })} />
                </Cell>
                <Cell>
                  <input type="date" defaultValue={p.videoNgayUp ? p.videoNgayUp.slice(0, 10) : ""} style={inputStyle(true)}
                    onBlur={(e) => scheduleSave(p.uuid, { videoNgayUp: e.target.value })} />
                </Cell>
                <Cell auto title="Tự động theo người sửa gần nhất trong nhóm Video">{picOf(p, "VIDEO")}</Cell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Group({ label, span }: { label: string; span: number }) {
  return (
    <th colSpan={span} style={{ padding: "6px 8px", textAlign: "center", borderLeft: "2px solid rgba(255,255,255,0.4)", fontSize: 12 }}>
      {label}
    </th>
  );
}

function Cell({ children, readonly, auto, maxWidth, title }: { children: React.ReactNode; readonly?: boolean; auto?: boolean; maxWidth?: number; title?: string }) {
  return (
    <td
      title={title}
      style={{
        padding: "5px 8px", verticalAlign: "middle",
        background: auto ? AUTO_BG : readonly ? READONLY_BG : "white",
        maxWidth, overflow: "hidden", textOverflow: "ellipsis", position: "relative",
      }}
    >
      {children}
    </td>
  );
}

function inputStyle(editable: boolean): React.CSSProperties {
  return { width: "100%", padding: "3px 6px", border: "1px solid #ddd", borderRadius: 4, background: editable ? EDITABLE_BG : "white", fontSize: 12.5 };
}
function smallBtn(bg: string): React.CSSProperties {
  return { background: bg, color: "white", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer" };
}
