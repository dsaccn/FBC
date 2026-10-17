import { prisma } from '@/lib/prisma'

export interface DuplicateReceiptConflict {
  isDuplicate: true
  ref: string
  conflictOrderId?: string
  conflictTable?: string
  conflictStatus?: string
  conflictDate?: Date
  errorMessage: string
}

/**
 * Extract normalized transaction reference from text, notes, or URL
 */
export function extractTransactionReference(raw: string | null | undefined): string | null {
  if (!raw) return null
  const str = String(raw).trim()
  if (!str) return null

  // 1. Telebirr URL
  const telebirrUrl = str.match(/\/receipt\/([A-Za-z0-9_-]+)/i)
  if (telebirrUrl) return telebirrUrl[1].toUpperCase()

  // 2. CBE URL with FT code (first 12 chars: FT + 10 alphanumeric)
  const cbeUrl = str.match(/[?&]id=(FT[0-9A-Z]{10})/i)
  if (cbeUrl) return cbeUrl[1].toUpperCase()

  // 3. Structured tag in notes: "[CBE Ref: FT26290B9PKK | ...]" or "[Telebirr Ref: CHQ0FJ403O | ...]" or "Ref: XYZ"
  const tagMatch = str.match(/(?:CBE|Telebirr|Digital|Slip)?\s*Ref:\s*([A-Za-z0-9_-]{6,32})/i)
  if (tagMatch) {
    return tagMatch[1].toUpperCase()
  }

  // 4. Standalone CBE FT pattern anywhere: FT26290B9PKK (12 chars: FT + 10 alphanumeric)
  const ftMatch = str.match(/\b(FT[0-9A-Z]{10})\b/i)
  if (ftMatch) {
    return ftMatch[1].toUpperCase()
  }

  // 5. Standalone single-word reference code (no whitespace in original string)
  if (!/\s/.test(str)) {
    const clean = str.replace(/[^A-Za-z0-9_-]/g, '')
    if (/^FT[0-9A-Z]{10,12}$/i.test(clean)) {
      return clean.slice(0, 12).toUpperCase()
    }
    // Telebirr transaction code: usually 10-14 alphanumeric, mixed letters and digits
    if (/^[A-Z0-9]{10,14}$/i.test(clean) && !/^[A-Z]+$/i.test(clean) && !/^[0-9]+$/i.test(clean)) {
      return clean.toUpperCase()
    }
  }

  return null
}

/**
 * Check if a transaction reference has already been used on another order or payment.
 * Ensures that EVERY transaction code can strictly only be used ONCE.
 */
export async function checkReceiptDuplicate(
  rawRef: string | null | undefined,
  excludeOrderId?: string | null
): Promise<DuplicateReceiptConflict | null> {
  const cleanRef = extractTransactionReference(rawRef)
  if (!cleanRef) return null

  // Helper to format table label
  const formatTable = (tableNumber?: string | null) => {
    const num = tableNumber || '?'
    const lower = num.toLowerCase()
    if (lower.startsWith('deliv')) return `Delivery #${num.replace(/^[A-Za-z-]+/, '')}`
    if (lower.startsWith('take')) return `Takeaway #${num.replace(/^[A-Za-z-]+/, '')}`
    return `Table ${num}`
  }

  // 1. Check local/active database via Prisma
  try {
    // a) Check Order table (active orders or paid orders with this verifiedRef)
    const conflictingOrder = await prisma.order.findFirst({
      where: {
        verifiedRef: cleanRef,
        status: { not: 'CANCELLED' },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
      include: { table: true, payment: true },
    })

    // b) Check Payment table (payments where notes contain this reference)
    const conflictingPayment = !conflictingOrder
      ? await prisma.payment.findFirst({
          where: {
            notes: { contains: cleanRef },
            ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
            order: {
              status: { not: 'CANCELLED' },
            },
          },
          include: { order: { include: { table: true } } },
        })
      : null

    const conflict = conflictingOrder || conflictingPayment?.order
    if (conflict) {
      const tableLabel = formatTable(conflict.table?.number)
      const dateVal =
        conflictingOrder?.payment?.createdAt ||
        conflictingPayment?.createdAt ||
        conflict.updatedAt ||
        conflict.createdAt
      const dateStr = dateVal
        ? new Date(dateVal).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' })
        : 'earlier'
      const statusText = conflict.status === 'PAID' ? 'ALREADY PAID & CLOSED' : 'ALREADY ATTACHED'

      return {
        isDuplicate: true,
        ref: cleanRef,
        conflictOrderId: conflict.id,
        conflictTable: tableLabel,
        conflictStatus: conflict.status,
        conflictDate: dateVal,
        errorMessage: `DUPLICATE TRANSACTION CODE: Reference ${cleanRef} was ${statusText} for ${tableLabel} on ${dateStr}! Each payment slip or transaction code can strictly only be used once.`,
      }
    }
  } catch (err) {
    console.warn('[checkReceiptDuplicate Prisma check failed]:', err)
  }

  // 2. If running locally with remote Neon database configured, also verify Neon PostgreSQL
  const neonUrl = process.env.NEON_DATABASE_URL
  if (!process.env.VERCEL && neonUrl) {
    try {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 4000 })

      // Check Neon Order
      const orderRes = await pool.query(
        `SELECT o.id, o.status, o."verifiedRef", o."createdAt", t.number as "tableNumber"
         FROM "Order" o
         LEFT JOIN "Table" t ON t.id = o."tableId"
         WHERE UPPER(o."verifiedRef") = $1
           AND o.status != 'CANCELLED'
           ${excludeOrderId ? 'AND o.id != $2' : ''}
         LIMIT 1`,
        excludeOrderId ? [cleanRef, excludeOrderId] : [cleanRef]
      )

      if (orderRes.rows.length > 0) {
        const row = orderRes.rows[0]
        await pool.end().catch(() => {})
        const tableLabel = formatTable(row.tableNumber)
        const dateStr = row.createdAt ? new Date(row.createdAt).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' }) : 'earlier'
        const statusText = row.status === 'PAID' ? 'ALREADY PAID & CLOSED' : 'ALREADY ATTACHED'
        return {
          isDuplicate: true,
          ref: cleanRef,
          conflictOrderId: row.id,
          conflictTable: tableLabel,
          conflictStatus: row.status,
          conflictDate: row.createdAt,
          errorMessage: `DUPLICATE TRANSACTION CODE: Reference ${cleanRef} was ${statusText} in cloud records for ${tableLabel} on ${dateStr}! Each payment slip can only be used once.`,
        }
      }

      // Check Neon Payment
      const payRes = await pool.query(
        `SELECT p.id, p."orderId", p.amount, p.method, p.notes, p."createdAt", o.status as "orderStatus", t.number as "tableNumber"
         FROM "Payment" p
         JOIN "Order" o ON o.id = p."orderId"
         LEFT JOIN "Table" t ON t.id = o."tableId"
         WHERE p.notes ILIKE $1
           AND o.status != 'CANCELLED'
           ${excludeOrderId ? 'AND p."orderId" != $2' : ''}
         LIMIT 1`,
        excludeOrderId ? [`%${cleanRef}%`, excludeOrderId] : [`%${cleanRef}%`]
      )

      await pool.end().catch(() => {})

      if (payRes.rows.length > 0) {
        const row = payRes.rows[0]
        const tableLabel = formatTable(row.tableNumber)
        const dateStr = row.createdAt ? new Date(row.createdAt).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' }) : 'earlier'
        return {
          isDuplicate: true,
          ref: cleanRef,
          conflictOrderId: row.orderId,
          conflictTable: tableLabel,
          conflictStatus: row.orderStatus,
          conflictDate: row.createdAt,
          errorMessage: `DUPLICATE TRANSACTION CODE: Reference ${cleanRef} was ALREADY PAID & CLOSED for ${tableLabel} on ${dateStr}! Each payment slip can only be used once.`,
        }
      }
    } catch (neonErr: any) {
      console.warn('[checkReceiptDuplicate Neon check warning]:', neonErr?.message)
    }
  }

  return null
}
