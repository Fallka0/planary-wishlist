import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Message } from '../app/Message';
import { Brand, ThemeButton } from '../app/Shell';
import shell from '../app/Shell.module.css';
import { api, ApiError } from '../lib/api';
import { keys } from '../lib/queryClient';
import { getSession, redirectToSignIn } from '../lib/session';
import { SharedList, useUndoLink } from '../shared/SharedList';
import { Button, ButtonLink, Skeleton } from '../ui';
import styles from '../shared/Shared.module.css';

/** Public share link · /w/:token. No account needed; signed-in visitors reserve with theirs (SCREENS.md §8b). */
export function PublicPage() {
  const token = useParams().token ?? '';
  const undoItemId = useUndoLink(token);
  const signedIn = getSession() !== null;
  const { data, error } = useQuery({ queryKey: keys.shared(token), queryFn: () => api.publicList(token), retry: false });

  if (error instanceof ApiError && error.status === 404) {
    // Not drawn: the auth message layout. An unknown or rotated token can't say whose list it was.
    return <Message title="This link doesn’t work anymore">Ask the person who shared it for a new one.</Message>;
  }
  if (error) return <Message title="That didn’t load">Reload the page to try again.</Message>;

  return (
    <>
      <header className={shell.top}>
        <Brand />
        <div className={shell.right}>
          <ThemeButton />
          {signedIn ? (
            <ButtonLink variant="line" small to="/app">
              Your lists
            </ButtonLink>
          ) : (
            <Button variant="line" small onClick={() => redirectToSignIn()}>
              Sign in
            </Button>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className={styles.page}>
        {data ? (
          <SharedList token={token} data={data} inApp={false} undoItemId={undoItemId} />
        ) : (
          <div className={styles.vis} aria-label="Loading">
            <Skeleton width={200} height={14} />
            <Skeleton width="45%" height={56} radius={12} className={styles.loadingTitle} />
          </div>
        )}
        <footer className={styles.foot}>
          <span>Shared with Planary Wishlist</span>
          <span>
            Make your own list on <a href="https://planary.ch/wishlist">planary.ch/wishlist</a>
          </span>
          <span className={styles.footLegal}>
            <a href="https://planary.ch/impressum">Impressum</a>
            <a href="https://planary.ch/datenschutz">Datenschutz</a>
          </span>
        </footer>
      </main>
    </>
  );
}
