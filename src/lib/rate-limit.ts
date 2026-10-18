import { LRUCache } from 'lru-cache'

export type RateLimitOptions = {
  interval: number // ms
  limit: number
}

const cache = new LRUCache<string, number[]>({ max: 500 })

export function getClientIp(req: Request): string {
  // 1. Cloudflare's authoritative connecting client IP
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp && cfIp.trim()) return cfIp.trim()

  // 2. Real IP from trusted proxy
  const realIp = req.headers.get('x-real-ip')
  if (realIp && realIp.trim()) return realIp.trim()

  // 3. Fallback forwarded-for (take last IP if multiple to minimize spoofing)
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }

  return '127.0.0.1'
}

export function rateLimit({ interval, limit }: RateLimitOptions) {
  return {
    check: (identifier: string): { success: boolean; remaining: number } => {
      const now = Date.now()
      const windowStart = now - interval
      const requests = (cache.get(identifier) ?? []).filter(t => t > windowStart)

      if (requests.length >= limit) {
        return { success: false, remaining: 0 }
      }

      requests.push(now)
      cache.set(identifier, requests)
      return { success: true, remaining: limit - requests.length }
    },
    reset: (identifier: string) => {
      cache.delete(identifier)
    },
  }
}

