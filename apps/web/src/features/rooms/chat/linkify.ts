export type Segment = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

// Only web links: http(s):// or a bare www. Anything else (javascript:, data:, mailto:) stays plain text.
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:'"\]}>]$/;

/** Drops what usually ends a sentence rather than a link: "see example.com/a." or "(example.com/a)". */
function trimLinkEnd(candidate: string): string {
  let link = candidate;
  for (;;) {
    if (TRAILING_PUNCTUATION.test(link)) {
      link = link.slice(0, -1);
    } else if (link.endsWith(')') && count(link, ')') > count(link, '(')) {
      link = link.slice(0, -1);
    } else {
      return link;
    }
  }
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** The href for a matched link, or null if it isn't a well-formed http(s) URL. */
function safeHref(link: string): string | null {
  const href = /^www\./i.test(link) ? `https://${link}` : link;
  try {
    const url = new URL(href);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? href : null;
  } catch {
    return null;
  }
}

/** Splits a chat message into plain text and links, for rendering as React children (never as HTML). */
export function splitLinks(text: string): Segment[] {
  const segments: Segment[] = [];
  const pushText = (part: string) => {
    if (!part) return;
    const last = segments.at(-1);
    if (last?.type === 'text') last.text += part;
    else segments.push({ type: 'text', text: part });
  };

  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const link = trimLinkEnd(match[0]);
    const href = link ? safeHref(link) : null;
    if (!href) continue;
    pushText(text.slice(cursor, match.index));
    segments.push({ type: 'link', text: link, href });
    cursor = match.index + link.length;
  }
  pushText(text.slice(cursor));
  return segments;
}
