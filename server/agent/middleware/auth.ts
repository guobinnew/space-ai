/**
 * Authentication middleware
 *
 * 参照 smart-code src/server/middleware/auth.ts 复刻。
 * 本地桌面应用场景下，使用 Bearer token 做简单鉴权。
 */

export function validateAuth(req: Request): { valid: boolean; error?: string } {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' }
  }

  const [scheme, token] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return { valid: false, error: 'Invalid Authorization format. Use: Bearer <token>' }
  }

  const authToken = process.env.SERVER_AUTH_TOKEN
  if (!authToken) {
    // No token configured — allow all (local dev mode)
    return { valid: true }
  }

  if (token !== authToken) {
    return { valid: false, error: 'Invalid auth token' }
  }

  return { valid: true }
}

/**
 * Helper to check auth and return 401 Response if invalid
 */
export function requireAuth(req: Request): Response | null {
  const { valid, error } = validateAuth(req)
  if (!valid) {
    return Response.json({ error: 'Unauthorized', message: error }, { status: 401 })
  }
  return null
}
