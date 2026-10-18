// The few emails Wishlist sends: co-planner invites and guests' undo links. Off unless
// RESEND_API_KEY is set; the app then shows or copies the link instead.
import type { Env } from './env';

export const mailEnabled = (env: Env) => Boolean(env.RESEND_API_KEY);

/** Sends a plain-text email. Returns whether it went out; failures are logged, never thrown. */
export async function sendMail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'Planary <noreply@planary.ch>', to, subject, text }),
    });
    if (!res.ok) {
      console.log(`mail to ${to.split('@')[1]}: resend responded ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(`mail: ${e}`);
    return false;
  }
}
