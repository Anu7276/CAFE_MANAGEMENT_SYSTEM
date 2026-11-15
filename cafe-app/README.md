# ☕ Café QR Table Ordering

Customers scan a QR code on their table → order from their phone → watch live status.
The owner manages orders, menu, tables/QR codes and reports from `/admin`.

## Run it
```bash
node server.js          # needs Node 18+, no npm install
```
- Customer: http://localhost:3000/?table=5
- Admin:    http://localhost:3000/admin  (default login **admin / admin123** – change in Settings)

Env vars: `PORT`, `ADMIN_USER`, `ADMIN_PASS` (only used the first time, when data/db.json is created).

## What's included (from your plan)
| Module | Where |
|---|---|
| Menu management (add / edit / delete / out-of-stock, image upload, veg tag, sizes, categories) | Admin → Menu items |
| Table management + one QR per table (download, print one / all) | Admin → Tables & QR |
| Live orders, accept/reject, Preparing → Ready → Served, instant sound + toast | Admin → Live orders |
| Real-time updates (Server-Sent Events, no refresh) | `/api/events` |
| Billing: subtotal, tax, printable bill, paid/unpaid | Bill button on any order |
| Reports: daily sales, top items, collected vs unpaid | Admin → Reports |
| Order history with search / date / status filters | Admin → Order history |
| Price snapshot per order (editing/deleting items never changes old bills) | `POST /api/orders` |

## API (matches the plan)
Public: `GET /api/items`, `GET /api/categories`, `GET /api/settings`, `POST /api/orders`, `GET /api/orders/:id`
Admin (JWT): `POST /api/admin/login`, `POST /api/admin/items`, `PUT /api/admin/items/:id`,
`PATCH /api/admin/items/:id/availability`, `DELETE /api/admin/items/:id`, `/api/admin/tables`,
`/api/admin/orders`, `PATCH /api/admin/orders/:id/status|payment`, `/api/admin/reports`, `/api/admin/settings`

## Before going live
1. Admin → **Tables & QR** → set your real website address, then print the QR codes.
2. Change the admin password; host on a server with HTTPS (Render, Railway, VPS…).
3. QR images use the `qrcodejs` CDN script (needs internet in the admin browser).

## Moving to MERN later
This build is intentionally dependency-free so it runs anywhere. The structure maps 1:1:
- `db` object in `server.js` → Mongoose models (Item, Table, Order, Settings, Admin)
- `route(...)` handlers → Express routers; `signJwt/verifyJwt` → `jsonwebtoken`
- `broadcast()` (SSE) → Socket.IO `io.emit`
- `public/js/*.js` views → React components (`viewMenu`, `viewCart`, `vLive`, `vItems`…)
- `/api/admin/upload` (saves to `public/uploads`) → Cloudinary
