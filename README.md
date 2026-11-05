# The Common Shelf – Book Store (Sprint 1 & Sprint 2)

Website Book Store dựng theo *Kế hoạch build website Book Store – Sprint 1 và Sprint 2*:
Node.js thuần, render HTML phía server, lưu dữ liệu bằng `node:sqlite`, **không dùng package ngoài**.

Giao diện và danh mục sách lấy từ dự án **Bookstore-Blueprint** ("The Common Shelf"): bảng màu xanh rêu/giấy kem,
font Playfair Display + DM Sans + DM Mono (Google Fonts), hero, lưới bìa sách, trang đăng nhập 2 cột, khu staff có sidebar,
cùng 30 đầu sách, 9 danh mục, 31 tác giả. Blueprint dùng React/Tailwind/PostgreSQL; ở đây giao diện được chuyển sang
CSS thuần + HTML render phía server để giữ ràng buộc "không package ngoài" của PMP.

**Ảnh bìa**: lấy từ Open Library theo ISBN qua route `/covers/isbn/<ISBN>.jpg`. Lần đầu server tải về và lưu ở
`data/covers/`, các lần sau phục vụ từ máy (chạy được offline, trình duyệt không gọi bên thứ ba). Sách không có bìa
trên Open Library (hiện có 2 cuốn) hiển thị ô màu kèm tên sách như blueprint.

## Chạy

Cần Node.js ≥ 22.13 (dùng được `node:sqlite` mà không cần cờ thử nghiệm).

```bash
cp .env.example .env     # rồi đặt ADMIN_PASSWORD
npm start                # http://localhost:3000
```

Lần chạy đầu sẽ tự tạo DB, 3 cửa hàng, tài khoản admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env`) và 30 đầu sách của blueprint.
Đăng ký / đăng nhập xong khách được đưa tới `/account`, admin tới `/admin` (theo luồng của blueprint).

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy và tự khởi động lại khi sửa code |
| `npm run seed` | Seed admin, cửa hàng, sách (chỉ thêm sách khi bảng đang rỗng) |
| `npm run seed:reset` | Xóa DB rồi seed lại từ đầu |
| `npm test` | Chạy 37 test tự động trên server thật với DB tạm |

## Phạm vi đã làm

| Sprint | Story | Route chính |
|---|---|---|
| 1 | US01 Đăng ký | `GET/POST /register` |
| 1 | US02 Đăng nhập / đăng xuất | `GET/POST /login`, `POST /logout`, `GET /account` |
| 1 | US20 Phân quyền | `requireAdmin` gắn cho cả nhóm `/admin` trong router |
| 1 | US11 Admin tạo tài khoản | `GET/POST /admin/users` |
| 1 | US19 Khóa / mở khóa | `POST /admin/users/:id/lock`, `/unlock` (chặn tự khóa mình) |
| 2 | US22 Danh mục | `/admin/categories` (+ `/:id`, `/:id/delete`) |
| 2 | US23 Tác giả | `/admin/authors` (+ `/:id`, `/:id/delete`) |
| 2 | US09 + US14 (CR-03) Sách, tồn kho 3 cửa hàng | `/admin/books`, `/admin/books/new`, `/admin/books/:id/edit` |
| 2 | US21 Xóa mềm / khôi phục | `POST /admin/books/:id/delete`, `/restore` |
| 2 | US03 Lưới sách | `GET /books?page=` – 12 sách/trang, mới nhất trước |
| 2 | (cho TC24) | `GET /books/:id` – sách đã ẩn báo "This book is not available" |

Ngoài phạm vi (Sprint 3 / Release 2): chi tiết sách đầy đủ, tìm kiếm, lọc, quản lý cửa hàng, giỏ hàng, thanh toán.

## Quyết định kỹ thuật

- **Mật khẩu**: `crypto.scrypt`, salt ngẫu nhiên, lưu dạng `scrypt$N$r$p$salt$key`.
- **Phiên**: bảng `sessions` chỉ lưu SHA-256 của token; cookie `sid` HttpOnly + SameSite=Lax; hết hạn sau `SESSION_TIMEOUT_MINUTES` phút không hoạt động. Khóa tài khoản xóa ngay mọi phiên của người đó.
- **Validate**: luật nằm ở `src/validate.js` và luôn chạy ở server; `public/js/app.js` chỉ báo lỗi nhanh.
- **Ảnh bìa**: tối đa 2 MB, nhận diện JPG/PNG/WEBP theo magic bytes (không tin tên file / MIME), lưu ở `public/uploads`.
- **Giá**: số nguyên VND. **Tồn kho**: bảng `book_stock` (khóa chính `book_id, store_id`, số lượng ≥ 0).
- **Đầu ra**: mọi dữ liệu được escape qua tagged template `html`; có CSP `script-src 'self'`.
- **Luật mật khẩu** (giả định, cần đối chiếu AC trong Product Backlog v1.1): 8–128 ký tự, có ít nhất 1 chữ và 1 số.

## Thông báo đúng như test case

- `Email is already registered`
- `Invalid email or password` (dùng chung cho sai mật khẩu và email không tồn tại)
- `Your account is locked. Please contact the store.`
- `This book is not available`
- `No books available yet`

## Ghi chú chạy test thủ công

- TC12: đặt `SESSION_TIMEOUT_MINUTES=1` trong `.env`.
- TC36: đặt `DB_PATH=data/empty.db` và `SEED_BOOKS=0` để có DB rỗng.
- TC03, TC10, TC15, TC21, TC32: gửi request trực tiếp bằng curl/Postman, server phải trả 400/403 và không ghi dữ liệu.
- TC34: mở DevTools → Network → Disable cache, tải `/books`.

Test tự động trong `tests/` chỉ bổ trợ, không thay cho cột kết quả của workbook – chỉ ghi kết quả đã chạy thật.

## Cấu trúc

```
src/
  server.js      khởi động, header bảo mật, phục vụ file tĩnh
  router.js      khớp route, guard theo tiền tố, xử lý lỗi 400/403/404
  middleware.js  session, requireLogin, requireAdmin
  validate.js    luật kiểm tra dùng chung
  covers.js      tải + cache ảnh bìa Open Library theo ISBN
  routes/        auth, users, taxonomy (danh mục + tác giả), books, catalog
  views/         layout (public + staff workspace), form helpers, icons
db/schema.sql    lược đồ 7 bảng
db/seed.js       admin, 3 cửa hàng, 30 sách của blueprint
public/          CSS, JS validate phía client, ảnh
tests/           test tự động (node:test)
```
