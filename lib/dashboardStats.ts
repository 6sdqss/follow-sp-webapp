// lib/dashboardStats.ts — thống kê Dashboard, CHỈ tính CE + GD (không tính LT — đã chốt).
import { db } from "./db";
import { getDoneStateName } from "./sync";

export type PeriodFilter = { year?: number; month?: number }; // month 1-12, kèm year

export type DashboardStats = {
  bySource: { source: "CE" | "GD"; total: number; done: number }[];
  totalOrder: number;
  totalDone: number;
  byNganhHang: { nganhHang: string; total: number; done: number }[];
  availableYears: number[];
};

export async function getDashboardStats(filter: PeriodFilter): Promise<DashboardStats> {
  const doneState = await getDoneStateName();

  const dateWhere: any = {};
  if (filter.year) {
    const start = new Date(filter.year, filter.month ? filter.month - 1 : 0, 1);
    const end = filter.month
      ? new Date(filter.year, filter.month, 1)
      : new Date(filter.year + 1, 0, 1);
    dateWhere.ngayOrder = { gte: start, lt: end };
  }

  const products = await db.product.findMany({
    where: { status: "Active", nguonGoc: { in: ["CE", "GD"] }, ...dateWhere },
    include: { workflow: true },
  });

  const bySourceMap: Record<"CE" | "GD", { total: number; done: number }> = {
    CE: { total: 0, done: 0 },
    GD: { total: 0, done: 0 },
  };
  const byNganhMap = new Map<string, { total: number; done: number }>();

  for (const p of products) {
    const isDone = p.workflow?.state === doneState;
    const src = p.nguonGoc as "CE" | "GD";
    bySourceMap[src].total++;
    if (isDone) bySourceMap[src].done++;

    const nganh = p.nganhHang || "(Không rõ)";
    if (!byNganhMap.has(nganh)) byNganhMap.set(nganh, { total: 0, done: 0 });
    const nganhEntry = byNganhMap.get(nganh)!;
    nganhEntry.total++;
    if (isDone) nganhEntry.done++;
  }

  // Danh sách năm có dữ liệu (để render dropdown lọc) — chỉ CE/GD.
  const allDated = await db.product.findMany({
    where: { status: "Active", nguonGoc: { in: ["CE", "GD"] }, ngayOrder: { not: null } },
    select: { ngayOrder: true },
  });
  const yearSet = new Set<number>();
  allDated.forEach((p) => { if (p.ngayOrder) yearSet.add(p.ngayOrder.getFullYear()); });

  const byNganhHang = Array.from(byNganhMap.entries())
    .map(([nganhHang, v]) => ({ nganhHang, ...v }))
    .sort((a, b) => b.total - a.total);

  return {
    bySource: (["CE", "GD"] as const).map((s) => ({ source: s, ...bySourceMap[s] })),
    totalOrder: bySourceMap.CE.total + bySourceMap.GD.total,
    totalDone: bySourceMap.CE.done + bySourceMap.GD.done,
    byNganhHang,
    availableYears: Array.from(yearSet).sort((a, b) => b - a),
  };
}
