import { Link } from 'react-router-dom';
import { ChoiceGrid, KindChoice, useNewList } from '../app/NewList';
import { useOverview } from '../app/Shell';
import { comingUp } from '../lib/comingUp';
import { formatDate, formatDayMonth, nextOccurrence, pluralise, todayInZurich } from '../lib/format';
import { nextOf } from '../lib/occasions';
import type { OverviewResponse } from '../lib/types';
import { Avatar, AvatarStack, Button, Icon, ProgressBar, Skeleton, Tag, Tile } from '../ui';
import page from './Page.module.css';
import styles from './OverviewPage.module.css';

function ComingUp({ data, today }: { data: OverviewResponse; today: Date }) {
  const cards = comingUp(data, today).slice(0, 3);
  if (cards.length === 0) return null;
  return (
    <section className={page.sec} aria-labelledby="h-up">
      <div className={page.secHead}>
        <h2 id="h-up" className={page.h2}>
          Coming up
        </h2>
        <span className={page.secSub}>Next 10 weeks</span>
      </div>
      <div className={styles.occ}>
        {cards.map((c) => (
          <Link key={c.key} className={styles.oc} to={c.to}>
            <span className={styles.ocTop}>
              <span>
                <span className={styles.ocTitle}>{c.title}</span>
                <span className={styles.ocDate}>{formatDate(c.date, today)}</span>
              </span>
              <span className={styles.ocDays}>
                {c.days > 1 ? (
                  <>
                    <span className={`d ${styles.ocNum}`}>{c.days}</span>
                    <span className={styles.ocUnit}>days</span>
                  </>
                ) : (
                  <span className={`d ${styles.ocNum}`}>{c.days === 0 ? 'today' : 'tomorrow'}</span>
                )}
              </span>
            </span>
            {c.progress !== null && <ProgressBar value={c.progress} label={c.right || c.left} />}
            <span className={styles.ocFoot}>
              <span>{c.left}</span>
              <span>{c.right}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MyWishlists({ data }: { data: OverviewResponse }) {
  if (data.lists.length === 0) return null;
  return (
    <section className={page.sec} aria-labelledby="h-my">
      <div className={page.secHead}>
        <h2 id="h-my" className={page.h2}>
          My wishlists
        </h2>
        <span className={page.secSub}>Things you’d like yourself</span>
      </div>
      <ul className={styles.lgrid}>
        {data.lists.map((l) => (
          <li key={l.id}>
            <Link className={styles.lc} to={`/app/lists/${l.id}`}>
              <span className={styles.mos} aria-hidden="true">
                {[0, 1, 2, 3].map((i) =>
                  l.previews[i] ? <Tile key={i} imageUrl={l.previews[i].imageUrl} /> : <span key={i} className={styles.blank} />,
                )}
              </span>
              <span className={styles.lcTitle}>
                {l.title}
                {l.shared ? <Tag icon="globe">Shared</Tag> : <Tag icon="lock">Private</Tag>}
              </span>
              <span className={styles.lcSub}>
                {pluralise(l.itemCount, 'item')}
                {l.occasion && ` · ${formatDayMonth(l.occasion)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GiftIdeas({ data, today }: { data: OverviewResponse; today: Date }) {
  if (data.people.length === 0) return null;
  return (
    <section className={page.sec} aria-labelledby="h-ppl">
      <div className={page.secHead}>
        <h2 id="h-ppl" className={page.h2}>
          Gift ideas
        </h2>
        <span className={page.secSub}>Only you and your co-planners see these</span>
      </div>
      <ul className={styles.pgr}>
        {data.people.map((p) => {
          const next = nextOf(p.occasions, today);
          return (
            <li key={p.id}>
              <Link className={styles.pc} to={`/app/people/${p.id}`}>
                <span className={styles.pcTop}>
                  <Avatar name={p.personFullName || p.title} size={44} />
                  <span>
                    <span className={styles.pcName}>{p.title}</span>
                    <span className={styles.pcSub}>{next ? `${next.occ.label} · ${formatDate(next.date, today)}` : 'No date yet'}</span>
                  </span>
                </span>
                <span className={styles.pcFoot}>
                  <span>{pluralise(p.ideaCount, 'idea')}</span>
                  <AvatarStack people={p.coPlanners} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SharedWithMe({ data, today }: { data: OverviewResponse; today: Date }) {
  if (data.shared.length === 0) return null;
  return (
    <section className={page.sec} aria-labelledby="h-sh">
      <div className={page.secHead}>
        <h2 id="h-sh" className={page.h2}>
          Shared with me
        </h2>
      </div>
      <ul className={styles.srows}>
        {data.shared.map((s) => {
          const date = s.occasion && nextOccurrence(s.occasion, today);
          return (
            <li key={s.listId}>
              <Link className={styles.srow} to={`/app/shared/${s.token}`}>
                <Avatar name={s.owner.name} />
                <span className={styles.srowMain}>
                  <span className={styles.srowTitle}>{s.title}</span>
                  <span className={styles.srowSub}>
                    {s.owner.name} · {pluralise(s.itemCount, 'item')}
                  </span>
                </span>
                {date && <span className={styles.srowDate}>{formatDate(date, today)}</span>}
                <Icon name="chevronRight" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Nothing at all yet: pick the first kind of list. */
function FirstRun() {
  const openNew = useNewList();
  return (
    <div className={styles.first}>
      <h1 className={page.h1}>What’s your first list?</h1>
      <p className={page.lead}>Start with things you’d like yourself, or with ideas for someone you buy for. You can have as many of both as you want.</p>
      <div className={styles.firstChoices}>
        <ChoiceGrid>
          <KindChoice kind="wish" withTile onClick={() => openNew('wish')} />
          <KindChoice kind="person" withTile onClick={() => openNew('person')} />
        </ChoiceGrid>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { data, isPending, isError } = useOverview();
  const openNew = useNewList();
  const today = todayInZurich();

  if (data && data.lists.length === 0 && data.people.length === 0 && data.shared.length === 0) return <FirstRun />;

  return (
    <>
      <div className={page.ph}>
        <h1 className={page.h1}>Overview</h1>
        <Button icon="plus" onClick={() => openNew()}>
          New list
        </Button>
      </div>
      {isPending && (
        <div className={page.sec} aria-label="Loading">
          <Skeleton width="40%" height={20} />
        </div>
      )}
      {isError && <p className={styles.error}>Your lists couldn’t be loaded. Reload the page to try again.</p>}
      {data && (
        <>
          <ComingUp data={data} today={today} />
          <MyWishlists data={data} />
          <GiftIdeas data={data} today={today} />
          <SharedWithMe data={data} today={today} />
        </>
      )}
    </>
  );
}
