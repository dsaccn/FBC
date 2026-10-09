# Project Memory

## Overview
FBC (Diva Addis / Meba Tech Pro) is a high-performance, luxury-themed Restaurant & Lounge POS, Inventory, Recipe Management, and Business Intelligence ERP system. It features a dual-operating model: cloud deployment (Vercel + Neon Serverless PostgreSQL) and an offline-first localhost deployment (Node.js + local SQLite) with bidirectional background cloud synchronization.

## Tech Stack
- **Framework & Runtime**: Next.js 15 (App Router), React 19, TypeScript, Node.js
- **Databases**: SQLite locally (`diva-addis.db`), PostgreSQL in cloud (Neon) via raw `pg` pool and dual Prisma schemas (`prisma/schema.prisma` & `prisma/schema.postgres.prisma`)
- **Styling**: Vanilla CSS with luxury gold & dark theme design system (`src/app/globals.css`), Lucide React icons
- **Key Features**: Live table management, POS ordering, digital receipt verification (Telebirr, CBE Birr), bar/store stock transfers, dynamic recipe-based COGS calculation, stock assets valuation, offline installer packaging

## File / Folder Map
- `src/lib/sync-engine.ts`: Core bidirectional cloud/local synchronization engine (Neon `pg` connection pool, immediate cloud push helpers, offline queue, pull-from-cloud reconciliation).
- `src/app/dashboard/inventory/page.tsx`: Inventory management for Store Stock, Bar Stock, Raw Ingredients, Store-to-Bar transfers, stock adjustments, and logs.
- `src/app/dashboard/recipes/page.tsx`: Recipe builder associating menu items with ingredient portions for live inventory deductions and dynamic COGS.
- `src/app/dashboard/reports/page.tsx`: Business Intelligence executive dashboard (P&L statement, dynamic COGS, Stock Assets Valuation, category profit performance, daily trends).
- `src/app/dashboard/menu/page.tsx`: Menu catalog, categories, pricing, portion multipliers, and item availability.
- `src/app/dashboard/tables/page.tsx`: Interactive dining table layout, order status, order merge, and table transfer.
- `src/app/dashboard/orders/page.tsx`: Real-time order monitoring, status filters, and waiter/cashier assignment.
- `src/app/dashboard/delivery/page.tsx`: Delivery and takeaway orders management.
- `src/components/OfflineBanner.tsx`: Online/offline connectivity banner, manual sync trigger, and background event dispatcher (`cloud-pull-complete`, `sync-complete`).
- `package-source.bat`, `package-offline.bat`, `install-offline.bat`, `install-online.bat`: Offline setup and deployment batch scripts.

## Rules & Preferences
- [2026-10-09] Strict constraint: NEVER modify offline installer files/scripts (`package-source.bat`, `install-online.bat`, offline zip archive) unless explicitly requested after all editing is finalized.
- [2026-10-09] Background data refreshes and sync ticks must be completely silent (`isSilent = true`), never replacing UI elements with "Loading..." placeholders or causing screen flicker.
- [2026-10-09] Maintain strict schema and data parity between local SQLite and cloud Neon PostgreSQL.
- [2026-10-09] User prefers clean, luxury gold/dark aesthetics without visual clutter or redundant controls.

## Decisions
- [2026-10-09] Recipes are reconciled between cloud and local by composite key `(menuItemId, ingredientId)` to prevent cross-database ID collisions.
- [2026-10-09] In Inventory (Ingredients tab), removed dynamic unit filter pills (`[Grams]`, `[Ml]`) to keep the filter toolbar minimal (`[All Ingredients]`, `[Low Stock]`).
- [2026-10-09] In Inventory (Store Stock tab), removed the arbitrary bottom TOTALS summary row summing unlike bottle/item counts.
- [2026-10-09] In Inventory, added a 1-click "Transfer All" button in the Store-to-Bar transfer modal.
- [2026-10-09] In Reports, removed Completed Orders and Cancellations KPI cards from top grid to focus on core financial and valuation metrics.
- [2026-10-09] In Reports, redesigned the desktop header for full-screen / widescreen displays: separated title and action buttons, and added a dedicated luxury filter toolbar with segmented period pills and custom date range.

## Solved Problems
- [2026-10-09] Local recipe ingredients disappeared upon refresh -> Caused by missing cloud push helper; added `pushRecipeToCloud` in `/api/recipes` POST/PATCH and composite key matching in `pullFromCloud`.
- [2026-10-09] Menu and Inventory pages flashed every few seconds -> Caused by `setLoading(true)` on every background sync tick; added `hasLoadedRef` and silent background updates (`isSilent = true`).

## Current State / Next Steps
- All recent updates committed and pushed to `main` (`3a4500d`).
- Local development server running actively on localhost:3000.
