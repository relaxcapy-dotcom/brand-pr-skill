import { NextResponse } from 'next/server'
import { apiError, configuredAppOrigin } from '@/lib/http'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  let origin: string
  try { origin = configuredAppOrigin() } catch (error) { return apiError(error) }
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', origin))

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    return NextResponse.redirect(new URL('/dashboard', origin))
  } catch {
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', origin))
  }
}
