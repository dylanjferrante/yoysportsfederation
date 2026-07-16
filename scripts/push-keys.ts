/**
 * Generate a VAPID keypair for web push. Run once, then put the output in .env:
 *
 *   npm run push:keys
 *
 *   VAPID_PUBLIC_KEY=...              # server (signs pushes)
 *   VAPID_PRIVATE_KEY=...             # server (keep secret)
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...  # client (same as VAPID_PUBLIC_KEY)
 *   VAPID_SUBJECT=mailto:you@example.com   # optional contact
 *
 * Restart the app afterwards. Until these are set, push is a safe no-op.
 */
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()
console.log('# Add these to .env:\n')
console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`)
console.log('VAPID_SUBJECT=mailto:no-reply@nexusfantasy.com')
