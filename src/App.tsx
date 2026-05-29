import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import BlurText from './components/react-bits/BlurText';
import ShinyText from './components/react-bits/ShinyText';
import {
  User,
  Wishlist,
  createWishlistItem,
  deleteWishlistItem,
  fetchSession,
  fetchWishlist,
  updateWishlistItem,
} from './lib/api';
import { supabase } from './lib/supabase';

import logoA from './assets/logoA.jpg';
import logoB from './assets/logoB.jpg';
import tiktokLogo from './assets/tiktok.svg';

interface SessionState {
  user: User | null;
  loading: boolean;
}

interface LayoutProps {
  user: User | null;
  onLogout: () => Promise<void>;
  children: React.ReactNode;
}

const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL ?? 'https://auth.planary.ch';

function formatPrice(priceCents: number) {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
  }).format(priceCents / 100);
}

function buildAuthUrl(mode: 'login' | 'signup', returnTo?: string) {
  const target = new URL(mode === 'signup' ? '/signup' : '/', AUTH_BASE_URL);
  target.searchParams.set('returnTo', returnTo ?? `${window.location.origin}/wishlist`);
  return target.toString();
}

function AuthRedirect({ mode, returnTo }: { mode: 'login' | 'signup'; returnTo?: string }) {
  useEffect(() => {
    window.location.assign(buildAuthUrl(mode, returnTo));
  }, [mode, returnTo]);

  return <div className="loading-state">Redirecting to Planary Auth...</div>;
}

async function absorbSessionFromHash() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return false;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    throw error;
  }

  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  return true;
}

function AppLayout({ user, onLogout, children }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="auth-container app-shell">
      <header className="header">
        <Link to={user ? '/wishlist' : '/'} className="brand-link" aria-label="Planary Wishlist Home">
          <img
            src="/brand-icon.svg"
            alt="Planary Logo"
            className="header-logo"
          />
          <span className="brand-copy">
            <span className="brand-title">Planary</span>
            <span className="brand-subtitle">Wishlist</span>
          </span>
        </Link>

        <div className="header-actions">
          <button
            type="button"
            className={`menu-toggle-btn ${isMenuOpen ? 'is-open' : ''}`}
            onClick={() => setIsMenuOpen((value) => !value)}
            aria-expanded={isMenuOpen}
            aria-controls="primary-navigation"
            aria-label="Toggle Navigation Menu"
          >
            <span />
            <span />
            <span />
          </button>

          <nav
            id="primary-navigation"
            className={`nav-links dashboard-nav-links ${isMenuOpen ? 'is-open' : ''}`}
            aria-label="Primary Navigation"
          >
            <Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
            <Link to="/wishlist" onClick={() => setIsMenuOpen(false)}>Wishlist</Link>
            {user ? (
              <button
                type="button"
                className="auth-nav-link auth-nav-button"
                onClick={() => {
                  setIsMenuOpen(false);
                  void onLogout();
                }}
              >
                Log out
              </button>
            ) : (
              <a
                href={buildAuthUrl('login')}
                className="auth-nav-link"
                onClick={() => setIsMenuOpen(false)}
              >
                Sign in
              </a>
            )}
          </nav>

        </div>
      </header>

      <main className={location.pathname === '/wishlist' ? 'wishlist-main-shell' : 'auth-main-content'}>
        {children}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <span className="copyright">
            &copy; {new Date().getFullYear()} Planary Wishlist - Built for shared gifting
          </span>

          <div className="footer-socials">
            <a href="https://github.com/planary" target="_blank" rel="noreferrer" className="social-link">
              <img src="https://www.svgrepo.com/show/512317/github-142.svg" alt="GitHub" />
            </a>
            <a href="https://instagram.com/planaryofficial" target="_blank" rel="noreferrer" className="social-link">
              <img src="https://www.svgrepo.com/show/521711/instagram.svg" alt="Instagram" />
            </a>
            <a href="https://www.tiktok.com/@planaryofficial" target="_blank" rel="noreferrer" className="social-link">
              <img src={tiktokLogo} alt="TikTok" style={{ width: '26px', height: '26px' }} />
            </a>
          </div>

          <div className="footer-legal">
            <a href="/">Home</a>
            <a href="/wishlist">Wishlist</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AuthPage({
  mode,
}: {
  mode: 'login' | 'register';
}) {
  useEffect(() => {
    document.title = mode === 'login' ? 'Planary Wishlist | Sign in' : 'Planary Wishlist | Create account';
  }, [mode]);

  return (
    <div className="auth-experience">
      <section className="auth-showcase">
        <span className="dashboard-kicker">Planary Wishlist</span>
        <BlurText
          text="Keep gift ideas together in one calm, focused place."
          className="hero-title"
          delay={90}
        />
        <p className="hero-copy">
          Save links, notes, and present ideas without turning the experience into a cluttered list of tabs and screenshots.
        </p>
      </section>

      <section className="auth-card">
        <img src={mode === 'login' ? logoA : logoB} alt="Planary mark" className="mobile-card-logo auth-brand-art" />
        <h2>{mode === 'login' ? 'Sign in for Planary Wishlist' : 'Create your wishlist account'}</h2>
        <p className="auth-card-subtitle">
          {mode === 'login'
            ? 'Use your shared Planary account and come straight back to your wishlist.'
            : 'Create one shared Planary account and use it across every app.'}
        </p>

        <button
          type="button"
          className="btn-primary"
          onClick={() => window.location.assign(buildAuthUrl(mode === 'login' ? 'login' : 'signup'))}
        >
          {mode === 'login' ? 'Continue to Planary Auth' : 'Create account on Planary Auth'}
        </button>

        <div className="divider">OR</div>

        <div className="auth-alt-copy">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <Link to={mode === 'login' ? '/register' : '/'} className="inline-link-cta">
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </Link>
        </div>
      </section>
    </div>
  );
}

function WishlistPage({ user }: { user: User }) {
  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState({
    name: '',
    url: '',
    notes: '',
    price: '',
    priority: '2',
  });

  useEffect(() => {
    document.title = 'Planary Wishlist | My Wishlist';
  }, []);

  async function loadWishlist() {
    setLoading(true);
    setErrorMessage('');
    try {
      const payload = await fetchWishlist();
      setWishlist(payload.wishlist);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWishlist();
  }, []);

  const reservedCount = useMemo(
    () => wishlist?.items.filter((item) => item.reserved).length ?? 0,
    [wishlist],
  );

  const totalBudget = useMemo(
    () => wishlist?.items.reduce((sum, item) => sum + item.priceCents, 0) ?? 0,
    [wishlist],
  );

  async function handleCreateItem(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');

    try {
      const priceCents = Math.max(0, Math.round(Number(formState.price || '0') * 100));
      await createWishlistItem({
        name: formState.name,
        url: formState.url,
        notes: formState.notes,
        priceCents,
        priority: Number(formState.priority),
      });
      setFormState({ name: '', url: '', notes: '', price: '', priority: '2' });
      await loadWishlist();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save item');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleReserved(itemId: number, reserved: boolean) {
    try {
      await updateWishlistItem(itemId, { reserved });
      await loadWishlist();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update item');
    }
  }

  async function handleDeleteItem(itemId: number) {
    try {
      await deleteWishlistItem(itemId);
      await loadWishlist();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete item');
    }
  }

  return (
    <div className="wishlist-page">
      <section className="wishlist-hero">
        <div className="wishlist-hero-copy">
          <span className="dashboard-kicker">Hello {user.email}</span>
          <BlurText text="Your wishlist is ready to grow." className="wishlist-hero-title" delay={85} />
          <p>
            Save the gifts you actually want, keep everything tidy, and make the experience feel
            unmistakably Planary from the very first screen.
          </p>
        </div>

        <div className="wishlist-stats-grid">
          <article className="stat-card">
            <span>Total items</span>
            <strong>{wishlist?.items.length ?? 0}</strong>
          </article>
          <article className="stat-card">
            <span>Reserved</span>
            <strong>{reservedCount}</strong>
          </article>
          <article className="stat-card">
            <span>Total value</span>
            <strong>{formatPrice(totalBudget)}</strong>
          </article>
        </div>
      </section>

      <section className="wishlist-grid">
        <div className="wishlist-panel form-panel">
          <div className="section-head">
            <h2>Add a new item</h2>
            <p>Drop in a product, note, or gift idea and keep the list current.</p>
          </div>

          {errorMessage ? <p className="message-box error-msg">{errorMessage}</p> : null}

          <form className="product-form" onSubmit={handleCreateItem}>
            <div className="input-group">
              <label htmlFor="item-name">Product name</label>
              <input
                id="item-name"
                value={formState.name}
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                placeholder="AirPods Pro"
              />
              <span className="input-hint">Leave this blank if the product page has a title we can pull in.</span>
            </div>
            <div className="input-group">
              <label htmlFor="item-url">URL</label>
              <input
                id="item-url"
                value={formState.url}
                onChange={(event) => setFormState((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://..."
              />
              <span className="input-hint">When possible, we’ll fetch the image and price from this link.</span>
            </div>
            <div className="input-group">
              <label htmlFor="item-notes">Notes</label>
              <textarea
                id="item-notes"
                value={formState.notes}
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Color, size, or why this matters"
                rows={4}
              />
            </div>
            <div className="form-row">
              <div className="input-group">
                <label htmlFor="item-price">Price (CHF)</label>
                <input
                  id="item-price"
                  type="number"
                  min="0"
                  step="0.05"
                  value={formState.price}
                  onChange={(event) => setFormState((current) => ({ ...current, price: event.target.value }))}
                  placeholder="199.00"
                />
              </div>
              <div className="input-group">
                <label htmlFor="item-priority">Priority</label>
                <select
                  id="item-priority"
                  value={formState.priority}
                  onChange={(event) => setFormState((current) => ({ ...current, priority: event.target.value }))}
                >
                  <option value="1">Low</option>
                  <option value="2">Medium</option>
                  <option value="3">High</option>
                </select>
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Add to wishlist'}
            </button>
          </form>
        </div>

        <div className="wishlist-panel items-panel">
          <div className="section-head">
            <h2>{wishlist?.title ?? 'My wishlist'}</h2>
            <p>Your saved items are all here when you need them.</p>
          </div>

          {loading ? <p className="empty-state">Loading your wishlist...</p> : null}

          {!loading && wishlist && wishlist.items.length === 0 ? (
            <p className="empty-state">No items yet. Add your first one from the form on the left.</p>
          ) : null}

          <div className="item-list">
            {wishlist?.items.map((item) => (
              <article key={item.id} className={`item-card ${item.reserved ? 'item-card-reserved' : ''}`}>
                {item.imageUrl ? (
                  <div className="item-image-wrap">
                    <img src={item.imageUrl} alt={item.name} className="item-image" loading="lazy" />
                  </div>
                ) : null}
                <div className="item-topline">
                  <span className="priority-pill">Priority {item.priority}</span>
                  <span className="item-price">{formatPrice(item.priceCents)}</span>
                </div>
                <h3>{item.name}</h3>
                {item.notes ? <p className="item-notes">{item.notes}</p> : null}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="item-link">
                    Visit product
                  </a>
                ) : null}
                <div className="item-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => void handleToggleReserved(item.id, !item.reserved)}
                  >
                    {item.reserved ? 'Mark as open' : 'Mark as reserved'}
                  </button>
                  <button
                    type="button"
                    className="ghost-action"
                    onClick={() => void handleDeleteItem(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<SessionState>({ user: null, loading: true });
  const navigate = useNavigate();

  useEffect(() => {
    async function bootstrapSession() {
      try {
        await absorbSessionFromHash();
        const payload = await fetchSession();
        setSession({ user: payload.user, loading: false });
      } catch {
        setSession({ user: null, loading: false });
      }
    }

    void bootstrapSession();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession({ user: null, loading: false });
    navigate('/');
  }

  if (session.loading) {
    return (
      <AppLayout
        user={session.user}
        onLogout={handleLogout}
      >
        <div className="loading-state">Loading Planary Wishlist...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      user={session.user}
      onLogout={handleLogout}
    >
      <Routes>
        <Route
          path="/"
          element={
            session.user ? <Navigate to="/wishlist" replace /> : <AuthPage mode="login" />
          }
        />
        <Route
          path="/register"
          element={
            session.user ? <Navigate to="/wishlist" replace /> : <AuthPage mode="register" />
          }
        />
        <Route
          path="/wishlist"
          element={
            session.user ? (
              <WishlistPage user={session.user} />
            ) : (
              <AuthRedirect mode="login" returnTo={`${window.location.origin}/wishlist`} />
            )
          }
        />
        <Route path="*" element={<Navigate to={session.user ? '/wishlist' : '/'} replace />} />
      </Routes>
    </AppLayout>
  );
}
