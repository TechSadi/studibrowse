import type { SVGProps } from 'react';

/** The open-book logo (`i-logo` in the mockup). Same paths as logo.svg; do not redesign. */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M4 6.5C6.5 5 9.5 5 12 6.5c2.5-1.5 5.5-1.5 8 0V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 6.5V19" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
