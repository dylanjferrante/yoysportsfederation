import crypto from 'crypto'

const secret = () => process.env.NEXTAUTH_SECRET || process.env.MOBILE_TOKEN_SECRET || 'dev-mobile-secret'

export function signMobileToken(payload: Record<string, unknown>, days = 30): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * 86_400_000 })).toString('base64url')
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyMobileToken(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (p.exp && Date.now() > p.exp) return null
    return p
  } catch { return null }
}

export function bearerUserId(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  return (verifyMobileToken(token)?.uid as string) ?? null
}
