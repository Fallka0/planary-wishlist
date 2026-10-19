/** A failure the caller may see: an HTTP status, a code from API.md and a message for the UI. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Only for "unreadable" link previews. */
    readonly store?: string,
  ) {
    super(message);
  }
}

export const invalid = (message: string) => new AppError(400, 'invalid', message);
export const forbidden = (message: string) => new AppError(403, 'forbidden', message);

/** Anything the caller may not see, so it never reveals that a list exists. */
export const notFound = () => new AppError(404, 'not_found', 'We couldn’t find that.');
export const taken = () => new AppError(409, 'taken', 'Someone else is already getting this.');
export const oneOccasion = () => new AppError(409, 'one_occasion', 'A wishlist can have one date.');
export const linkOff = () => new AppError(404, 'link_off', 'This link doesn’t work anymore.');
export const rateLimited = () => new AppError(429, 'rate_limited', 'Too many reservations from here. Try again in an hour.');
export const unreadableBody = () => new AppError(400, 'invalid', 'We couldn’t read that request.');
