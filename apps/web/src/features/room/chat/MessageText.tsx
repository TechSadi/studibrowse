import { splitLinks } from './linkify';

/** A message's text with its links made clickable. React escapes the text, so nothing in it is ever HTML. */
export function MessageText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((segment, i) =>
        segment.type === 'link' ? (
          <a key={i} href={segment.href} target="_blank" rel="noopener noreferrer">
            {segment.text}
          </a>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
