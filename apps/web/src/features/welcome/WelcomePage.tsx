import { useEffect } from 'react';
import { AvatarStack } from '../../components/ui/Avatar';
import { Brand } from '../../components/ui/Brand';
import { ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LivePill } from '../../components/ui/Pill';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { FEATURES, LIVE_STATS, PROOF_AVATARS, STEPS } from './landingContent';
import { RoomPreviewCard } from './RoomPreviewCard';
import styles from './WelcomePage.module.css';

function LandingNav() {
  return (
    <header className={styles.nav}>
      <div className={styles.navInner}>
        <Brand />
        <nav className={styles.links} aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className={styles.actions}>
          <ThemeToggle />
          <ButtonLink to="/login" variant="ghost" className={styles.navLogin}>
            Log in
          </ButtonLink>
          <ButtonLink to="/signup">Sign up free</ButtonLink>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.dots} aria-hidden="true" />
      <div className={styles.copy}>
        <LivePill>{LIVE_STATS.peopleStudying} people studying right now</LivePill>
        <h1>
          Study with people, <em>not alone.</em>
        </h1>
        <p>
          Open a room, share the link, and focus together on one shared timer. Everyone works on their own
          thing, nobody studies alone.
        </p>
        <div className={styles.cta}>
          <ButtonLink to="/signup" size="lg">
            Create your free account
            <Icon name="arrow" />
          </ButtonLink>
          <ButtonLink to="/login" variant="ghost" size="lg">
            I already have one
          </ButtonLink>
        </div>
        <div className={styles.proof}>
          <AvatarStack people={PROOF_AVATARS} />
          <span>
            <b>{LIVE_STATS.liveRooms} live rooms</b> open right now
          </span>
        </div>
      </div>
      <RoomPreviewCard />
    </section>
  );
}

function HowItWorks() {
  return (
    <section className={styles.section} id="how" aria-labelledby="how-title">
      <div className={styles.head}>
        <div className="eyebrow">How it works</div>
        <h2 id="how-title">From alone to focused in a minute.</h2>
        <p>No matching, no scheduling. Open a room or jump into one that&apos;s already going.</p>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((step) => (
          <li key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section className={styles.section} id="features" aria-labelledby="features-title">
      <div className={styles.head}>
        <div className="eyebrow">Built for real study sessions</div>
        <h2 id="features-title">Everything a good study group needs.</h2>
      </div>
      <div className={styles.features}>
        {FEATURES.map((feature) => (
          <div key={feature.title}>
            <span className={styles.featureIcon}>
              <Icon name={feature.icon} />
            </span>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={styles.final}>
      <h2>Your next study session is waiting.</h2>
      <p>Free to use. Sign up in under a minute.</p>
      <ButtonLink to="/signup" size="lg" className={styles.finalButton}>
        Create your free account
        <Icon name="arrow" />
      </ButtonLink>
    </section>
  );
}

export function WelcomePage() {
  useEffect(() => {
    document.title = 'StudiBrowse: study with people, not alone';
  }, []);

  return (
    <div className={styles.page}>
      <LandingNav />
      <main className={styles.main}>
        <Hero />
        <HowItWorks />
        <FeatureGrid />
        <FinalCta />
        <footer className={styles.footer}>
          <span>© 2026 StudiBrowse</span>
          <span>Privacy · Terms · Help</span>
        </footer>
      </main>
    </div>
  );
}
