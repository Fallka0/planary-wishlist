export interface Env {
  DB: D1Database;
  /** The web app's files (dist). Absent in tests. */
  ASSETS?: Fetcher;
  /** Service binding to the planary-auth Worker, which confirms sign-in tokens. */
  AUTH: Fetcher;
  /** Base for share and invite links. Falls back to the request's own origin. */
  PUBLIC_APP_URL?: string;
  /** Local development only: ask planary-auth over the internet instead of the service binding. */
  AUTH_API_URL?: string;
  /** Optional email for invites and guests' undo links (Resend). Unset = no email. */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

/** A signed-in Planary account, as planary-auth describes it. */
export interface User {
  id: string;
  email: string;
  name: string;
}
