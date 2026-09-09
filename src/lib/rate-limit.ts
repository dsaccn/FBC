import { LRUCache } from 'lru-cache'

export type RateLimitOptions = {
  interval: number // ms
  limit: number
}

const cache = new LRUCache<string, number[]>({ max: 500 })

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
  }
}
