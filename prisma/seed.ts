// prisma/seed.ts — seed FieldMapping (thay _MAPPING) + Setting (thay _SETTING) mặc định.
// Alias lấy đúng theo header thực tế trong "Order SP MỚI" anh gửi (33 cột), CỘNG THÊM khả năng
// mở rộng: sau này ngành hàng đổi tên cột -> chỉ cần thêm alias qua UI /settings/mapping,
// KHÔNG SỬA CODE — đúng yêu cầu "cấu trúc lúc nào cũng update, không có rule cố định".
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const mappingSeed: { sourceKey: string; internalField: string; aliases: string[]; required?: boolean }[] = [
  { sourceKey: "ALL", internalField: "ngayOrder", aliases: ["NGAY ORDER", "NGÀY ORDER", "NGAY TAO", "NGÀY TẠO"] },
  { sourceKey: "ALL", internalField: "nganhHang", aliases: ["NGANH HANG", "NGÀNH HÀNG", "CATEGORY", "NGANH"] },
  { sourceKey: "ALL", internalField: "tenModel", aliases: ["TEN MODEL", "TÊN MODEL", "TEN SAN PHAM", "TÊN SẢN PHẨM", "PRODUCT NAME"] },
  { sourceKey: "ALL", internalField: "maErp", aliases: ["MA ERP SAN PHAM", "MÃ ERP SẢN PHẨM", "MA ERP", "MÃ ERP", "CODE ERP", "ERP"], required: true },
  { sourceKey: "ALL", internalField: "idSanPham", aliases: ["ID SAN PHAM", "ID SẢN PHẨM", "ID SP", "PRODUCT ID", "ID PRODUCT", "ID"] },
  { sourceKey: "ALL", internalField: "linkFolder", aliases: ["LINK FOLDER", "SPECS SAN PHAM", "SPECS", "SPEC", "FOLDER"] },
  // USER PHU TRACH trong Order CE/LT — dùng làm GỢI Ý ban đầu cho "Nhân sự Khai báo" lúc tạo
  // SP mới (quyết định #10), KHÔNG phải trường sync ghi đè liên tục sau đó.
  { sourceKey: "ALL", internalField: "nhanSuKhaiBao", aliases: ["USER PHU TRACH", "USER PHỤ TRÁCH", "NGUOI PHU TRACH", "NGƯỜI PHỤ TRÁCH", "NHAN SU KHAI BAO", "NHÂN SỰ KHAI BÁO", "PIC"] },
  { sourceKey: "ALL", internalField: "linkHinh", aliases: ["LINK HINH", "LINK HÌNH", "HINH ANH", "HÌNH ẢNH", "IMAGE", "LINK IMAGE"] },
  { sourceKey: "ALL", internalField: "trangThaiOnweb", aliases: ["DA ONWEB", "ĐÃ ONWEB", "TRANG THAI ONWEB", "TRẠNG THÁI ONWEB", "STATUS ONWEB", "ONWEB"] },
  { sourceKey: "ALL", internalField: "ngayOnwebSrc", aliases: ["NGAY ONWEB", "NGÀY ONWEB", "NGAY LEN WEB", "NGÀY LÊN WEB", "NGAY DA ONWEB"] },
  // CE/GD dùng cột "TRẠNG THÁI KHAI BÁO DỰ KIẾN (ADMIN ĐIỀN)" — đúng header thật trong file anh gửi.
  { sourceKey: "CE", internalField: "trangThaiOnweb", aliases: ["TRANG THAI KHAI BAO DU KIEN", "DA ONWEB", "TRANG THAI ONWEB", "ONWEB"] },
  { sourceKey: "GD", internalField: "trangThaiOnweb", aliases: ["TRANG THAI KHAI BAO DU KIEN", "DA ONWEB", "TRANG THAI ONWEB", "ONWEB"] },
];

// 3 trạng thái theo quyết định đã chốt — thay hoàn toàn bộ 8 state cũ, bỏ Priority/SLA.
const settingSeed: { key: string; value: string; note?: string }[] = [
  { key: "WORKFLOW_STATES", value: "Đang xử lý|Chưa onweb|Đã onweb" },
  { key: "DONE_STATE_NAME", value: "Đã onweb", note: "Phải khớp 100% một giá trị trong WORKFLOW_STATES" },
  { key: "ARCHIVE_AFTER_DAYS", value: "30" },
];

async function main() {
  for (const m of mappingSeed) {
    await db.fieldMapping.upsert({
      where: { sourceKey_internalField: { sourceKey: m.sourceKey, internalField: m.internalField } },
      update: { aliases: m.aliases, required: m.required ?? false },
      create: { ...m, required: m.required ?? false },
    });
  }
  for (const s of settingSeed) {
    await db.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
  console.log("✅ Seed FieldMapping + Setting xong.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
