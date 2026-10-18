// Reading JSON bodies. A field of the wrong type is "We couldn't read that request.", like a body
// that isn't JSON at all; a missing field is undefined, and null only where a field allows it.
import { unreadableBody } from './errors';

export type Body = Record<string, unknown>;

const MAX_BODY = 64 * 1024;

export async function readBody(req: Request): Promise<Body> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw unreadableBody();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unreadableBody();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw unreadableBody();
  return parsed as Body;
}

export function str(b: Body, key: string): string | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw unreadableBody();
  return v;
}

export function int(b: Body, key: string): number | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw unreadableBody();
  return v;
}

export function bool(b: Body, key: string): boolean | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw unreadableBody();
  return v;
}

export function strList(b: Body, key: string): string[] | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw unreadableBody();
  return v as string[];
}

/** For PATCH fields that can be cleared: undefined = leave it, null = clear it. */
export function nullableInt(b: Body, key: string): number | null | undefined {
  if (!(key in b)) return undefined;
  if (b[key] === null) return null;
  return int(b, key);
}
