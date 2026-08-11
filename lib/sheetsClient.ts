// lib/sheetsClient.ts — đọc Google Sheets qua LINK CÔNG KHAI (CSV export), KHÔNG cần
// Service Account / Google Cloud Console / thẻ ngân hàng (đổi theo yêu cầu — Hướng A).
//
// ĐIỀU KIỆN: 3 file Sheet nguồn (CE/GD/LT) phải để chế độ chia sẻ
// "Anyone with the link -> Viewer" (Bất kỳ ai có đường liên kết -> Người xem).
// Web app CHỈ ĐỌC qua URL export CSV — không có cách nào ghi ngược lại Sheet gốc.
import Papa from "papaparse";

export type SourceConfig = {
  key: "LT" | "CE" | "GD";
  name: string;
  spreadsheetId: string;
  gid?: string; // ID của tab (sheet con) cụ thể — để trống = tab đầu tiên (gid=0)
};

function csvExportUrl(src: SourceConfig): string {
  const gid = src.gid && src.gid.trim() ? src.gid.trim() : "0";
  return `https://docs.google.com/spreadsheets/d/${src.spreadsheetId}/export?format=csv&gid=${gid}`;
}

/** Trả về mảng 2 chiều (values), y hệt sheet.getDataRange().getValues() trong Apps Script cũ. */
export async function fetchSheetValues(src: SourceConfig): Promise<unknown[][]> {
  const url = csvExportUrl(src);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Không đọc được "${src.name}" (mã lỗi ${res.status}). Kiểm tra lại chế độ chia sẻ của ` +
        `Sheet phải là "Anyone with the link - Viewer" (Bất kỳ ai có đường liên kết - Người xem).`
      );
    }
    throw new Error(`Lỗi tải "${src.name}": HTTP ${res.status}`);
  }
  const csvText = await res.text();
  // Nếu Google trả về trang HTML đăng nhập thay vì CSV (do Sheet chưa public) -> báo lỗi rõ ràng
  // thay vì để Papa.parse âm thầm trả về rác.
  if (csvText.trim().startsWith("<")) {
    throw new Error(
      `"${src.name}" chưa được chia sẻ công khai (nhận về trang HTML thay vì CSV). ` +
      `Vào Sheet -> Chia sẻ -> đổi thành "Anyone with the link - Viewer".`
    );
  }
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
  return parsed.data as unknown[][];
}

export function getSourceListFromEnv(): SourceConfig[] {
  const list: SourceConfig[] = [];
  const ltActive = (process.env.SOURCE_LT_ACTIVE_SYNC ?? "TRUE").toUpperCase() !== "FALSE";
  if (ltActive && process.env.SOURCE_LT_SPREADSHEET_ID) {
    list.push({
      key: "LT", name: "LƯU TRỮ GỐC",
      spreadsheetId: process.env.SOURCE_LT_SPREADSHEET_ID,
      gid: process.env.SOURCE_LT_GID,
    });
  }
  if (process.env.SOURCE_CE_SPREADSHEET_ID) {
    list.push({
      key: "CE", name: "ORDER CE",
      spreadsheetId: process.env.SOURCE_CE_SPREADSHEET_ID,
      gid: process.env.SOURCE_CE_GID,
    });
  }
  if (process.env.SOURCE_GD_SPREADSHEET_ID) {
    list.push({
      key: "GD", name: "ORDER GD",
      spreadsheetId: process.env.SOURCE_GD_SPREADSHEET_ID,
      gid: process.env.SOURCE_GD_GID,
    });
  }
  return list;
}
