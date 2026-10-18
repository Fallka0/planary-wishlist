// Guests' undo tokens, so a guest still sees "You're getting this" and can undo from this browser.
// One entry per share link, as api-types.ts says: localStorage["wl-undo:<shareToken>"] = { [itemId]: undoToken }.

const key = (shareToken: string) => `wl-undo:${shareToken}`;

/** Undo tokens for one share link, by item id. */
export function undoTokens(shareToken: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(shareToken)) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function write(shareToken: string, tokens: Record<string, string>) {
  try {
    if (Object.keys(tokens).length) window.localStorage.setItem(key(shareToken), JSON.stringify(tokens));
    else window.localStorage.removeItem(key(shareToken));
  } catch {
    // Storage blocked: undo then only works from the email link.
  }
}

export function saveUndoToken(shareToken: string, itemId: number, undoToken: string) {
  write(shareToken, { ...undoTokens(shareToken), [itemId]: undoToken });
}

export function forgetUndoToken(shareToken: string, itemId: number) {
  const tokens = { ...undoTokens(shareToken) };
  delete tokens[itemId];
  write(shareToken, tokens);
}
