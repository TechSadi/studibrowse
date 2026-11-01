import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

const RESET_MS = 1800;

type CopyState = 'idle' | 'copied' | 'failed';

const LABELS: Record<CopyState, string> = {
  idle: 'Copy invite',
  copied: 'Link copied',
  failed: 'Couldn’t copy. Select the link instead',
};

/** "Copy invite" that briefly reads "Link copied" (mockup `#copyInvite`). */
export function CopyLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), RESET_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      // Missing outside secure contexts (plain http on a LAN address).
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      <Icon name={state === 'copied' ? 'check' : 'link'} />
      <span aria-live="polite">{LABELS[state]}</span>
    </Button>
  );
}
