// Email transport. Env-gated: when SMTP isn't configured this is a safe no-op
// that logs in dev, so the notification framework works everywhere. To enable
// real delivery, set SMTP_URL (and EMAIL_FROM) and install `nodemailer`, then
// uncomment the nodemailer block below.
export async function sendEmail(to: string, subject: string, body: string, link?: string): Promise<void> {
  const smtp = process.env.SMTP_URL
  const text = link ? `${body}\n\n${process.env.NEXTAUTH_URL ?? ''}${link}` : body
  if (!smtp) {
    if (process.env.NODE_ENV !== 'production') console.log(`[email:noop] → ${to} · ${subject} · ${text}`)
    return
  }
  try {
    // const nodemailer = (await import('nodemailer')).default
    // const transport = nodemailer.createTransport(smtp)
    // await transport.sendMail({ from: process.env.EMAIL_FROM ?? 'no-reply@nexusfantasy.com', to, subject, text })
    console.log(`[email:send] → ${to} · ${subject}`)
  } catch (e) {
    console.error('[email] send failed', e)
  }
}
