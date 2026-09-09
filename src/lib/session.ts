import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secretStr = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || ''

if (!secretStr || secretStr.length < 64) {
  throw new Error('JWT_SECRET must be at least 64 characters')
}

const JWT_SECRET = new TextEncoder().encode(secretStr)

export interface SessionUser {
  id: string
  username: string
  fullName?: string
  role: string
}

export async function signToken(payload: object): Promise<string> {
  const jti = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .setJti(jti) // prevent token replay
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    })
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

export async function createSession(user: SessionUser) {
  const token = await signToken({
    id: user.id,
    username: user.username,
    fullName: user.fullName || user.username,
    role: user.role,
  })

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12, // 12 hours
    path: '/',
  })
  return token
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session')?.value
    if (!token) return null
    const payload = await verifyToken(token)
    if (!payload) return null
    return {
      id: String(payload.id || ''),
      username: String(payload.username || ''),
      fullName: String(payload.fullName || payload.username || ''),
      role: String(payload.role || ''),
    }
  } catch {
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
