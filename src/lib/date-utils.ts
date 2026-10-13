/**
 * Timezone-aware date parsing for Kogna Coffee & FBC POS.
 * Defaults to East Africa Time (UTC+3 / Africa/Addis_Ababa) so hosted cloud
 * servers (running in UTC) accurately filter business day orders.
 */

export function parseDateFilter(
  from?: string | null,
  to?: string | null,
  tzParam?: string | null
): { gte?: Date; lte?: Date } {
  // Default to Ethiopia time: UTC+3 (getTimezoneOffset is -180 minutes)
  let offsetMinutes = -180
  if (tzParam !== undefined && tzParam !== null && tzParam !== '') {
    const parsed = parseInt(tzParam, 10)
    if (!isNaN(parsed)) {
      offsetMinutes = parsed
    }
  }

  // Format offset string e.g. '+03:00' or '-05:00'
  const sign = offsetMinutes <= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMinutes)
  const hours = String(Math.floor(absMin / 60)).padStart(2, '0')
  const mins = String(absMin % 60).padStart(2, '0')
  const tzString = `${sign}${hours}:${mins}`

  const dateWhere: { gte?: Date; lte?: Date } = {}

  if (from) {
    const fromStr = from.includes('T') ? from : `${from}T00:00:00${tzString}`
    const d = new Date(fromStr)
    dateWhere.gte = isNaN(d.getTime()) ? new Date(from) : d
  }

  if (to) {
    const toStr = to.includes('T') ? to : `${to}T23:59:59.999${tzString}`
    const d = new Date(toStr)
    dateWhere.lte = isNaN(d.getTime()) ? new Date(to) : d
  }

  return dateWhere
}
