import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../lib/api';
import { config } from '../../lib/config';
import { useAuth } from './AuthContext';
import { serverError } from './formErrors';
import styles from './GoogleButton.module.css';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_MAX_WIDTH = 400; // Google renders its button at most 400px wide
const UNAVAILABLE = 'Google sign-in is not available right now.';

// The small part of the Google Identity Services API we use.
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(
        parent: HTMLElement,
        options: { type: 'standard'; size: 'large'; text: 'continue_with'; width: number },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let gisPromise: Promise<GoogleIdentity> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  gisPromise ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error('GIS missing')));
    script.onerror = () => {
      gisPromise = null; // allow a retry on the next visit
      reject(new Error('GIS failed to load'));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

/** Google's "G", in the single colour the design uses. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        className={styles.mark}
        d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

/**
 * Stretches Google's rendered button to cover the design's button exactly, so every click on it goes to Google.
 * Google sizes its button itself (max 400px wide), so the scale is recomputed whenever either box changes size.
 */
function useCoverScale(wrapper: HTMLElement | null, overlay: HTMLElement | null) {
  useEffect(() => {
    if (!wrapper || !overlay) return;
    const update = () => {
      const width = overlay.offsetWidth;
      const height = overlay.offsetHeight;
      if (!width || !height) return;
      overlay.style.setProperty('--sx', String(wrapper.offsetWidth / width));
      overlay.style.setProperty('--sy', String(wrapper.offsetHeight / height));
    };
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    observer.observe(overlay);
    update();
    return () => observer.disconnect();
  }, [wrapper, overlay]);
}

/**
 * The design's "Continue with Google" button. Google Identity Services only issues the ID token our server
 * verifies through its own button, so that button sits on top, invisible and stretched to the same size: people
 * see the design, and the click (or Enter/Space, since focus moves into Google's button) reaches Google.
 */
export function GoogleButton() {
  const { signIn } = useAuth();
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    config.googleClientId ? 'loading' : 'unavailable',
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useCoverScale(wrapper, overlay);

  // GIS keeps the callback it was initialised with; route it through a ref so it always uses the latest signIn.
  const handleCredential = useRef<(credential: string) => void>(() => {});
  useEffect(() => {
    handleCredential.current = (credential) => {
      setError(null);
      setPending(true);
      authApi
        .google({ credential, keepLoggedIn: true })
        .then(signIn)
        .catch((err: unknown) => {
          setError(serverError(err).message);
          setPending(false);
        });
    };
  }, [signIn]);

  useEffect(() => {
    if (!config.googleClientId || !wrapper || !overlay) return;
    let active = true;
    loadGoogleIdentity().then(
      (google) => {
        if (!active) return;
        google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: ({ credential }) => handleCredential.current(credential),
        });
        overlay.replaceChildren();
        google.accounts.id.renderButton(overlay, {
          type: 'standard',
          size: 'large',
          text: 'continue_with',
          width: Math.min(GOOGLE_MAX_WIDTH, wrapper.offsetWidth || GOOGLE_MAX_WIDTH),
        });
        setStatus('ready');
      },
      () => active && setStatus('unavailable'),
    );
    return () => {
      active = false;
    };
  }, [wrapper, overlay]);

  const unavailable = status === 'unavailable';
  return (
    <div>
      <div
        ref={setWrapper}
        className={unavailable ? `${styles.wrap} ${styles.off}` : styles.wrap}
        aria-busy={status === 'loading' || pending}
      >
        {/* What people see. The real control is Google's button on top, or nothing when unavailable. */}
        <div className={styles.face} aria-hidden={!unavailable}>
          <GoogleMark />
          {pending ? 'Signing in…' : 'Continue with Google'}
        </div>
        {unavailable ? null : <div ref={setOverlay} className={styles.overlay} data-testid="google-button" />}
      </div>
      {unavailable || error ? (
        <div className={styles.msg} role={error ? 'alert' : undefined}>
          {error ?? UNAVAILABLE}
        </div>
      ) : null}
    </div>
  );
}
