import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { countdown, countdownShort, daysBetween, nextOccurrence, todayInZurich } from '../lib/format';
import { keys } from '../lib/queryClient';
import { accountUrl, getSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import type { Occasion, OverviewResponse } from '../lib/types';
import { Avatar, Button, Icon, IconButton, PlanaryMark, Skeleton, useModal } from '../ui';
import { NewListProvider, useNewList } from './NewList';
import { SearchBox, SearchSheet } from './Search';
import styles from './Shell.module.css';

export function useOverview() {
  return useQuery({ queryKey: keys.overview, queryFn: api.overview });
}

/** The signed-in user's name: from the overview once it's loaded, from the token until then. */
function useMyName(overview?: OverviewResponse) {
  return overview?.me.displayName || getSession()?.name || '';
}

/** "Planary | Wishlist" at the left of the top bar. */
export function Brand() {
  return (
    <div className={styles.brand}>
      <a className={styles.wm} href="https://planary.ch">
        <PlanaryMark className={styles.mark} />
        <span>Planary</span>
      </a>
      <span className={styles.app}>Wishlist</span>
    </div>
  );
}

export function ThemeButton() {
  const [theme, toggleTheme] = useTheme();
  return <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme} />;
}

function TopBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const [searching, setSearching] = useState(false);
  const { data } = useOverview();
  const name = useMyName(data);

  return (
    <header className={styles.top}>
      <IconButton
        icon="menu"
        label="Open your lists"
        className={styles.phoneOnly}
        aria-expanded={menuOpen}
        aria-controls="lists"
        onClick={onMenu}
      />
      <Brand />
      <SearchBox />
      <div className={styles.right}>
        <IconButton icon="search" label="Search" className={styles.phoneOnly} onClick={() => setSearching(true)} />
        <ThemeButton />
        <a className={styles.avatarLink} href={accountUrl()} aria-label={`Your Planary account, ${name}`}>
          <Avatar name={name} me />
        </a>
      </div>
      {searching && <SearchSheet onClose={() => setSearching(false)} />}
    </header>
  );
}

/** Days until the soonest occasion, for the sidebar's "17 d". */
function soonest(occasions: Occasion[]): number | null {
  const today = todayInZurich();
  let best: number | null = null;
  for (const o of occasions) {
    const next = nextOccurrence(o, today);
    if (next) {
      const d = daysBetween(today, next);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

/** Focus and Esc handling while the sidebar is open as a sheet on phones. */
function SheetBehaviour({ sheet, onClose }: { sheet: RefObject<HTMLElement | null>; onClose: () => void }) {
  useModal(sheet, onClose);
  return null;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isPending, isError } = useOverview();
  const name = useMyName(data);
  const sheet = useRef<HTMLElement>(null);
  const openNew = useNewList();

  return (
    <nav id="lists" ref={sheet} className={[styles.side, open && styles.open].filter(Boolean).join(' ')} aria-label="Your lists" tabIndex={-1}>
      {open && <SheetBehaviour sheet={sheet} onClose={onClose} />}
      <div className={styles.sideTop}>
        <span className={styles.sideTitle}>Lists</span>
        <IconButton icon="x" label="Close lists" onClick={onClose} />
      </div>
      <Button icon="plus" wide className={styles.newList} onClick={() => {
          onClose();
          openNew();
        }}>
        New list
      </Button>
      <NavLink to="/app" end className={styles.item}>
        <span className={styles.itemIcon}>
          <Icon name="home" />
        </span>
        <span className={styles.itemText}>Overview</span>
      </NavLink>

      {isPending && (
        <div className={styles.loading} aria-label="Loading your lists">
          {[70, 55, 62, 48].map((w) => (
            <Skeleton key={w} width={`${w}%`} height={14} />
          ))}
        </div>
      )}
      {isError && <p className={styles.none}>Your lists couldn’t be loaded.</p>}

      {data && (
        <>
          <div className={styles.group}>
            <p className={styles.groupHead}>My wishlists</p>
            {data.lists.length === 0 && <p className={styles.none}>No wishlists yet</p>}
            {data.lists.map((l) => (
              <NavLink key={l.id} to={`/app/lists/${l.id}`} className={styles.item}>
                <span className={styles.itemIcon}>
                  <Icon name="gift" />
                </span>
                <span className={styles.itemText}>{l.title}</span>
                <span className={styles.itemCount}>{l.itemCount}</span>
              </NavLink>
            ))}
          </div>
          <div className={styles.group}>
            <p className={styles.groupHead}>Gift ideas</p>
            {data.people.length === 0 && <p className={styles.none}>Nobody yet</p>}
            {data.people.map((p) => {
              const days = soonest(p.occasions);
              return (
                <NavLink key={p.id} to={`/app/people/${p.id}`} className={styles.item}>
                  <Avatar name={p.personFullName || p.title} size={26} />
                  <span className={styles.itemText}>{p.title}</span>
                  {days !== null && (
                    <span className={styles.itemCount}>
                      <span aria-hidden="true">{countdownShort(days)}</span>
                      <span className="sr-only">, {countdown(days)}</span>
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
          <div className={styles.group}>
            <p className={styles.groupHead}>Shared with me</p>
            {data.shared.length === 0 && <p className={styles.none}>Lists friends share with you show up here.</p>}
            {data.shared.map((s) => (
              <NavLink key={s.listId} to={`/app/shared/${s.token}`} className={styles.item}>
                <Avatar name={s.owner.name} size={26} />
                <span className={styles.itemText}>{s.title}</span>
              </NavLink>
            ))}
          </div>
        </>
      )}

      <div className={styles.foot}>
        <a className="ul" href={accountUrl()}>
          Planary account
        </a>
        {name && <span>Signed in as {name}</span>}
        <span className={styles.legal}>
          <a className="ul" href="https://planary.ch/impressum">Impressum</a>
          <a className="ul" href="https://planary.ch/datenschutz">Datenschutz</a>
        </span>
      </div>
    </nav>
  );
}

/** Top bar, sidebar and the page. */
export function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Following a link in the phone menu closes it.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <NewListProvider>
      <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} />
      <div className={styles.shell}>
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main id="main" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>
    </NewListProvider>
  );
}
