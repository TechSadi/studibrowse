import type { KeyboardEvent } from 'react';

const NEXT_KEYS = ['ArrowRight', 'ArrowDown'];
const PREV_KEYS = ['ArrowLeft', 'ArrowUp'];

/**
 * Arrow-key handling for a custom radiogroup of buttons (WAI-ARIA radio pattern): arrows move the
 * selection and the focus together, wrapping at the ends. Only the selected button is in the tab order.
 */
export function onRadioKeyDown(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  select: (index: number) => void,
) {
  let next: number;
  if (NEXT_KEYS.includes(event.key)) next = (index + 1) % count;
  else if (PREV_KEYS.includes(event.key)) next = (index - 1 + count) % count;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = count - 1;
  else return;
  event.preventDefault();
  select(next);
  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
}
