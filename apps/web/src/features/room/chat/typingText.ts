/** The line under the messages: "Hana is typing…", "Hana and Riley are typing…" or "Several people are typing…". */
export function typingText(names: string[]): string {
  const [first, second] = names;
  if (!first) return '';
  if (names.length === 1) return `${first} is typing…`;
  if (names.length === 2) return `${first} and ${second} are typing…`;
  return 'Several people are typing…';
}
