import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Message } from '../app/Message';
import { api, ApiError } from '../lib/api';
import { possessive } from '../lib/comingUp';
import { keys } from '../lib/queryClient';
import { Button, ButtonLink, useToast } from '../ui';

const home = <ButtonLink to="/app">Go to your lists</ButtonLink>;

/** What went wrong with an invite, in the same words as the rest of the app. */
function InviteError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Message title="This invite doesn’t work anymore" action={home}>
        It may have been used already, or the list was deleted. Ask for a new link.
      </Message>
    );
  }
  if (error instanceof ApiError && error.status === 403) {
    return (
      <Message title="This invite is for someone else" action={home}>
        {error.message}
      </Message>
    );
  }
  if (error instanceof ApiError && error.status === 400) {
    return (
      <Message title="This is your own list" action={home}>
        You started it, so you’re already planning it.
      </Message>
    );
  }
  return (
    <Message title="That didn’t load" action={home}>
      Reload the page to try again.
    </Message>
  );
}

/**
 * Accept a co-planner invite · /invite/:token. Not in the design; built like the other full-page
 * messages. Someone already on the list goes straight to it.
 */
export function InvitePage() {
  const token = useParams().token ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const preview = useQuery({ queryKey: ['invite', token], queryFn: () => api.invitePreview(token), retry: false });

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: async (listId) => {
      await qc.invalidateQueries({ queryKey: keys.overview });
      navigate(`/app/people/${listId}`, { replace: true });
      if (preview.data && !preview.data.alreadyMember) toast(`You’re planning ${possessive(preview.data.listTitle)} gifts now`);
    },
  });

  const already = preview.data?.alreadyMember;
  useEffect(() => {
    if (already && accept.isIdle) accept.mutate();
  }, [already, accept]);

  if (preview.error) return <InviteError error={preview.error} />;
  if (accept.error) return <InviteError error={accept.error} />;
  if (!preview.data || already) return <Message title="Opening the invite">One moment.</Message>;

  const { listTitle, invitedBy } = preview.data;
  return (
    <Message
      title={`Plan ${possessive(listTitle)} gifts together`}
      action={
        <>
          <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
            Join {listTitle}
          </Button>
          <ButtonLink variant="ghost" to="/app">
            Not now
          </ButtonLink>
        </>
      }
    >
      {invitedBy.name} invited you. Co-planners add ideas and see who’s getting what. {listTitle} never sees this list.
    </Message>
  );
}
