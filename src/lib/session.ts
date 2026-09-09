import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'

const JWT_ISSUER = 'nexora-tech-pos'
const JWT_AUDIENCE = 'nexora-pos-client'

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'nexora-tech-pos-super-secure-production-key-2026'
  return new TextEncoder().encode(secret)
}

export interface SessionUser {
  id: string
  username: string
  fullName: string
  role: string
}

export async function createSession(user: SessionUser) {
  const secret = getJwtSecret()
  const randomJti = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)

  const token = await new SignJWT({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setJti(randomJti)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret)

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12, // 12 hours
    path: '/',
  })
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    return {
      id: payload.id as string,
      username: payload.username as string,
      fullName: payload.fullName as string,
      role: payload.role as string,
    }
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session')?.value
    if (!token) return null
    return await verifyToken(token)
  } catch {
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
