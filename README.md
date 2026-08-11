# FOLLOW SP ONWEB — Web App (bản nâng cấp từ hệ Apps Script)

Web app thay thế "QUẢN LÝ SP" cũ. Vẫn đọc dữ liệu từ 3 Sheet nguồn (CE / GD / LT) như trước,
nhưng lưu dữ liệu chính vào **Postgres thật** (nhanh hơn, không giới hạn ô/khoá như Google Sheets)
và cho anh **sửa ID sản phẩm, FL bài viết, Ghi chú, PIC, Trạng thái, Priority** trực tiếp trên web,
tự lưu, **không bao giờ bị lần đồng bộ sau ghi đè** — đúng nguyên tắc "trường tĩnh" của hệ cũ.

## Kiến trúc

```
Order CE (Sheets) ─┐
Order GD (Sheets) ─┼─► [Cron 12h/17h] ─► sync engine ─► Postgres ─► Web UI (đọc/sửa ID, FL bài viết...)
LT      (Sheets) ──┘        (chỉ đọc,           (ERP đã có = bỏ qua
                              KHÔNG ghi ngược)     hoàn toàn, không đè)
```

- **Next.js** — vừa frontend (bảng sản phẩm) vừa backend (API routes).
- **Postgres** (khuyên dùng **Neon** — neon.tech, free tier, tạo trong 1 phút, hoặc Supabase).
- **Prisma** — ORM, migrate schema bằng lệnh, không phải tự tay tạo bảng.
- **Vercel** — hosting + Vercel Cron chạy đúng giờ 12:00/17:00 (giờ VN) mỗi ngày.
- **Google Service Account** — đọc 3 Sheet nguồn, KHÔNG bao giờ ghi ngược vào đó.

## Quyết định mới nhất (thay đổi lớn so với bản trước)

11. **Đọc Sheet nguồn qua LINK CÔNG KHAI** (Hướng A) — KHÔNG cần Google Cloud Console, KHÔNG cần
    Service Account, KHÔNG cần thẻ ngân hàng. Chỉ cần 3 Sheet (CE/GD/LT) để chế độ chia sẻ
    **"Anyone with the link" → Viewer**. Web app đọc qua URL export CSV (`lib/sheetsClient.ts`).
    Đánh đổi: ai có link cũng xem được dữ liệu (không giới hạn theo tài khoản cụ thể).
12. **Đem hết TẤT CẢ các dòng có dữ liệu** — kể cả thiếu cả ERP lẫn Tên sản phẩm, miễn dòng đó
    có ít nhất 1 ô không trống. Chỉ bỏ qua dòng hoàn toàn trống. Tên trống → hiển thị
    `"(chưa có tên)"`.
13. **Dashboard chỉ tính Order CE + GD**, không tính LƯU TRỮ GỐC (LT).
14. **UI/UX**: đổi theme màu tím-xanh gradient (`#6238e5 → #0B57D0`), thẻ số liệu (StatCard),
    thanh tiến độ màu theo ngành hàng, TopNav chung cho Products + Dashboard.

## Bước 1 (MỚI — thay cho Service Account cũ) — Public hoá 3 Sheet nguồn

1. Mở từng Sheet (CE, GD, LT) → nút **Chia sẻ (Share)** góc trên phải.
2. Đổi thành **"Anyone with the link"** → quyền **Viewer**.
3. (Tuỳ chọn) Nếu công ty dùng Google Workspace, có thể giới hạn thành
   "Anyone at thegioididong.com" thay vì công khai hoàn toàn với internet — vẫn hoạt động
   được với `lib/sheetsClient.ts` miễn máy chủ Vercel gọi được URL export (không cần đăng nhập).
4. Không cần làm gì thêm — 3 `spreadsheetId` đã điền sẵn trong `.env.example` đúng theo
   `config.gs` cũ.

## Bước 2 — Tạo Database Postgres (Neon)

1. Vào neon.tech → tạo project mới → copy connection string dạng
   `postgresql://user:pass@host/db?sslmode=require`.

## Bước 3 — Cấu hình local

```bash
cp .env.example .env
# Điền DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
# 3 spreadsheetId (đã điền sẵn đúng theo config.gs cũ), CRON_SECRET, APP_PASSWORD.

npm install
npx prisma migrate dev --name init   # tạo bảng trong Postgres
npm run seed                          # seed FieldMapping + Setting mặc định
```

## Bước 4 — Migrate TOÀN BỘ dữ liệu cũ (không mất gì)

```bash
# Thêm vào .env:
#   LEGACY_SPREADSHEET_ID = ID file Sheet đang chứa hệ mini-PIM cũ
#   LEGACY_MASTER_GID / LEGACY_WORKFLOW_GID / LEGACY_ASSIGNMENT_GID / LEGACY_HISTORY_GID
#   (chuột phải thanh tab dưới cùng -> "Hiện sheet ẩn" -> click từng tab -> copy số sau "gid=" trên URL)
npm run migrate-legacy
```

Script đọc `_MASTER_PRODUCT`, `_WORKFLOW`, `_ASSIGNMENT`, `_HISTORY` qua CSV công khai, giữ
nguyên UUID, an toàn chạy lại nhiều lần (upsert, không tạo trùng). Nhớ để file Sheet cũ ở chế
độ share công khai (Bước 1) trước khi chạy, có thể tắt share lại sau khi migrate xong.

## Bước 5 — Chạy thử local

```bash
npm run dev
# mở http://localhost:3000/products
```

## Bước 6 — Deploy lên Vercel

1. Đẩy code lên GitHub repo riêng.
2. Vào vercel.com → **Import Project** từ repo đó.
3. Khai báo đầy đủ biến môi trường ở Bước 3 trong **Project Settings → Environment Variables**.
4. Deploy — `vercel.json` đã khai báo sẵn 2 lịch cron (05:00 và 10:00 UTC = 12:00 và 17:00 giờ VN).

> **Lưu ý gói Hobby (free) của Vercel:** cron có thể bị giới hạn tần suất tuỳ thời điểm Vercel
> áp dụng chính sách. Nếu 2 cron/ngày không chạy đúng giờ trên gói free, dùng dịch vụ ping ngoài
> miễn phí như **cron-job.org** gọi `GET https://<domain>/api/cron/sync` với header
> `Authorization: Bearer <CRON_SECRET>` vào đúng 2 mốc giờ — hoạt động y hệt, không phụ thuộc gói Vercel.

## Cấu trúc 6 nhóm cột (theo đúng bảng "Tổng hợp dữ liệu demo" anh gửi)

| Nhóm | Cột | Ai/cái gì ghi vào |
|---|---|---|
| 1. Thông tin cơ bản | Site kinh doanh*, Ngày Order, Nguồn, Ngành hàng, ERP, Tên sản phẩm | **Sync tự động** (trừ Site kinh doanh — sửa tay) |
| 2. CMS | ID, ID phiên bản, Link Web, Link CMS | **Sửa tay**. Link Web/Link CMS KHÔNG lưu — tự tính từ ID |
| 3. PIM | Mã Model, Mã biến thể | **Sửa tay** |
| 4. Specs/Folder | Link Folder | **Sync tự động** (từ cột LINK FOLDER nguồn) |
| 5. Khai báo sản phẩm | Trạng thái workflow, Ngày onweb, Priority, Nhân sự KB, Ghi chú | Trạng thái/Ngày onweb qua workflow; Nhân sự + Ghi chú **sửa tay** |
| 6. Bài viết | Bài viết DMX, Bài viết TGDD, Slider, Nhân sự BV | **Sửa tay**, tách riêng theo site |
| 7. Video | Nội dung đề xuất, Link, Ngày up, Nhân sự Video | **Sửa tay** |

**3 vai trò "Nhân sự"** (Khai báo / Bài viết / Video) là 3 người khác nhau — lưu trong bảng
`Assignment` với `role = KHAI_BAO | BAI_VIET | VIDEO`, không gộp chung 1 PIC như hệ cũ.

## 10 quyết định đã chốt (bản mới nhất — thay thế phần "giả định" trước đó)

1. **ID phiên bản**: 1 sản phẩm có thể nhiều ID phiên bản, lưu trong 1 trường mảng (`idPhienBanList`), không tách bảng riêng.
2. **Priority**: bỏ hẳn khỏi hệ thống.
3. **Trạng thái workflow**: chỉ còn 3 mức — `Đang xử lý` / `Chưa onweb` / `Đã onweb` (thay 8 state cũ).
4. **Site kinh doanh**: luôn sửa tay, không tự suy luận theo Ngành hàng.
5. **"Nhân sự"** (Khai báo/Bài viết/Video): **KHÔNG chọn dropdown** — tự động gán theo người đang đăng nhập tại thời điểm họ sửa field trong nhóm đó (xem `FIELD_TO_ROLE` trong `app/api/products/[uuid]/route.ts`).
6. **"Đã Onweb"**: nhận biết qua so khớp `state`, cấu hình được qua `Setting.DONE_STATE_NAME`.
7. **Đăng nhập**: chỉ nhập **Mã NV**, không mật khẩu. Mã chưa từng thấy → hỏi thêm Tên → tự đăng ký vào bảng `Staff`. Xem `lib/auth.ts`, `app/login/page.tsx`.
8. **Sản phẩm mới luôn hiện trên đầu**: đảm bảo bằng `orderBy: createdAt desc` ở `app/products/page.tsx`.
9. **Nguồn đổi dữ liệu sau khi SP đã tồn tại**: KHÔNG tự áp dụng, KHÔNG im lặng bỏ qua — tạo `Conflict` loại `SOURCE_CHANGED`, hiện badge 🔶 nhỏ trên dòng sản phẩm, người dùng tự bấm **Áp dụng**/**Bỏ qua** (xem phần cuối `lib/sync.ts` + `app/api/conflicts/`).
10. **Tạo SP mới**: nếu Order CE có sẵn cột "NHÂN SỰ KHAI BÁO" → tạo gợi ý ban đầu (`Assignment.status = 'Suggested'`), người đăng nhập đầu tiên sửa nhóm Khai báo sẽ tự ghi đè bằng dòng `'Confirmed'` của họ.

## Nguyên tắc KHÔNG ĐƯỢC PHÁ VỠ (giữ đúng tinh thần hệ cũ)

- **ERP đã tồn tại → sync bỏ qua hoàn toàn**, không sửa bất kỳ trường nào của sản phẩm đó.
- Toàn bộ nhóm **CMS, PIM, Bài viết, Video** + **ID, Ghi chú, Site kinh doanh** — tuyệt đối chỉ
  sửa tay qua `/api/products/[uuid]` (danh sách trắng `STATIC_STRING_FIELDS` trong route đó).
  `lib/sync.ts` **không hề import hay đụng tới** các trường này — về mặt code là không thể ghi đè,
  không chỉ là "quy ước".
- **Ngày onweb** chỉ set đúng 1 lần khi trạng thái chạm "Đã Onweb" lần đầu, không bao giờ ghi đè lại.
- Cấu trúc cột nguồn (CE/GD/LT) thay đổi → sửa alias trong bảng `FieldMapping` (qua
  `npx prisma studio` hoặc UI `/settings/mapping` sẽ bổ sung sau) — **không sửa code**.

## Việc còn lại (roadmap gợi ý, chưa làm trong bản scaffold này)

- [ ] Trang `/dashboard` (thống kê theo nguồn/ngành hàng — port `dashboard.gs`)
- [ ] Trang `/conflicts` xử lý HARD_CONFLICT / POSSIBLE_DUPLICATE (port `conflict.gs`)
- [ ] Trang `/settings/mapping` sửa alias cột ngay trên UI (không cần Prisma Studio)
- [ ] Đăng nhập thật (hiện mới có `APP_PASSWORD` đơn giản, chưa gắn middleware)
- [ ] Export lịch sử (History) ra CSV
