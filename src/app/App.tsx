import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from '../lib/queryClient';
import { getSession, redirectToSignIn } from '../lib/session';
import { InvitePage } from '../pages/InvitePage';
import { ListPage } from '../pages/ListPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PersonPage } from '../pages/PersonPage';
import { PublicPage } from '../pages/PublicPage';
import { SharedPage } from '../pages/SharedPage';
import { ButtonLink } from '../ui';
import { Frame } from './Frame';
import { Message } from './Message';
import { Shell } from './Shell';

/** Sends signed-out visitors to auth.planary.ch, which brings them back to the same page. */
function SignInRedirect({ returnTo }: { returnTo?: string }) {
  useEffect(() => redirectToSignIn(returnTo), [returnTo]);
  return <Message title="Signing you in">One moment, we’re taking you to your Planary account.</Message>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  return getSession() ? children : <SignInRedirect />;
}

/** "/" goes to the app when signed in, otherwise to sign-in and then the app. */
function Root() {
  return getSession() ? <Navigate to="/app" replace /> : <SignInRedirect returnTo={`${window.location.origin}/app`} />;
}

function NotFound() {
  return (
    <Message title="Nothing here" action={<ButtonLink to="/app">Go to your lists</ButtonLink>}>
      This page doesn’t exist. Maybe the link is old.
    </Message>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Frame>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <Shell />
                </RequireAuth>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="lists/:id" element={<ListPage />} />
              <Route path="people/:id" element={<PersonPage />} />
              <Route path="shared/:token" element={<SharedPage />} />
            </Route>
            <Route path="/w/:token" element={<PublicPage />} />
            <Route
              path="/invite/:token"
              element={
                <RequireAuth>
                  <InvitePage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Frame>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
