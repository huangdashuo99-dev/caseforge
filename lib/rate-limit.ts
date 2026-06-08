interface RateLimitResult {
  allowed: boolean
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  // MVP: stub implementation. Replace with Vercel KV when deployed.
  // For now, always allow. Rate limiting is a Vercel KV feature.
  void ip
  return { allowed: true }
}
