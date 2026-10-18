import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Message } from '../app/Message';
import { api, ApiError } from '../lib/api';
import { keys } from '../lib/queryClient';
import { SharedList } from '../shared/SharedList';
import { ButtonLink, Skeleton } from '../ui';
import styles from '../shared/Shared.module.css';

/** A list shared with me · /app/shared/:token, inside the app (SCREENS.md §8a). */
export function SharedPage() {
  const token = useParams().token ?? '';
  const { data, error } = useQuery({ queryKey: keys.shared(token), queryFn: () => api.publicList(token), retry: false });

  if (error instanceof ApiError && error.status === 404) {
    return (
      <Message inline title="This link doesn’t work anymore" action={<ButtonLink to="/app">Go to your lists</ButtonLink>}>
        The list was unshared or got a new link. Ask the person who shared it for a new one.
      </Message>
    );
  }
  if (error)
    return (
      <Message inline title="That didn’t load">
        Reload the page to try again.
      </Message>
    );
  if (!data) {
    return (
      <div aria-label="Loading">
        <Skeleton width={200} height={14} />
        <Skeleton width="45%" height={56} radius={12} className={styles.loadingTitle} />
      </div>
    );
  }
  return <SharedList key={token} token={token} data={data} inApp />;
}
