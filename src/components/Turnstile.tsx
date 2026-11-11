import { useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile — invisible for almost everyone.
 *
 * It starts verifying as soon as it mounts and stays hidden unless Cloudflare
 * genuinely needs an interaction ("appearance: interaction-only"), so most
 * people never see a captcha at all. Remount it (change its `key`) to get a
 * fresh token after a failed submit.
 *
 * Defaults to Cloudflare's always-pass TEST site key for local dev. Set
 * VITE_TURNSTILE_SITE_KEY (and TURNSTILE_SECRET_KEY on the server) for prod.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error('load-failed')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

interface Props {
  onVerify: (token: string) => void
  onError?: (message: string) => void
}

export function Turnstile({ onVerify, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const cb  = useRef({ onVerify, onError })
  cb.current = { onVerify, onError }

  useEffect(() => {
    let cancelled = false
    let widgetId: string | null = null
    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          'refresh-expired': 'auto',
          callback: (token: string) => cb.current.onVerify(token),
          'expired-callback': () => cb.current.onVerify(''),
          'error-callback': () => cb.current.onError?.('Couldn’t confirm you’re human. Try again in a moment.'),
        })
      })
      .catch(() => cb.current.onError?.('Couldn’t load the human check. Check your connection.'))

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) {
        try { window.turnstile.remove(widgetId) } catch { /* already gone */ }
      }
    }
  }, [])

  // Collapses to nothing unless Cloudflare decides to show a challenge
  return <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }} />
}
