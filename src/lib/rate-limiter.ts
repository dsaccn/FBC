/**
 * In-memory sliding window rate limiter
 * Protects against brute-force and DoS attacks.
 */

interface RateLimitRecord {
  count: number
  resetTime: number
}

const store = new Map<string, RateLimitRecord>()

// Periodically clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of store.entries()) {
    if (now > record.resetTime) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000).unref?.()

export interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  max: number // Max number of allowed requests in that window
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetInSeconds: number
}

/**
 * Checks and increments rate limit counter for a given key (e.g. IP + route)
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const record = store.get(key)

  if (!record || now > record.resetTime) {
    store.set(key, {
      count: 1,
      resetTime: now + options.windowMs,
    })
    return {
      success: true,
      remaining: options.max - 1,
      resetInSeconds: Math.ceil(options.windowMs / 1000),
    }
  }

  if (record.count >= options.max) {
    return {
      success: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
    }
  }

  record.count += 1
  return {
    success: true,
    remaining: options.max - record.count,
    resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
  }
}

/**
 * Extracts client IP from request headers
 */
export function getClientIp(req: Request): string {
  const headers = req.headers
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  const realIp = headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  return '127.0.0.1'
}
