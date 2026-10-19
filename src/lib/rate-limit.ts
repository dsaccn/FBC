import { LRUCache } from 'lru-cache'

export type RateLimitOptions = {
  interval: number // ms
  limit: number
}

const cache = new LRUCache<string, number[]>({ max: 500 })

export function getClientIp(req: Request): string {
  // 1. Cloudflare Tunnel authoritative client IP
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp && cfIp.trim()) return cfIp.trim()

  // 2. Vercel native client IP header
  const vercelIp = req.headers.get('x-vercel-forwarded-for')
  if (vercelIp && vercelIp.trim()) return vercelIp.split(',')[0].trim()

  // 3. Real IP from direct edge
  const realIp = req.headers.get('x-real-ip')
  if (realIp && realIp.trim()) return realIp.trim()

  // 4. Standard forwarded-for (first IP in chain is client IP)
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts[0]
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

