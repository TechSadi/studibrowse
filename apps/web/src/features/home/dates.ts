/** "Good morning" from 5am, "Good afternoon" from noon, "Good evening" from 6pm. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Friday, October 30". */
export function formatHomeDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export interface WeekDay {
  /** One-letter label, "S" to "S". */
  label: string;
  /** Full name for screen readers, "Sunday". */
  name: string;
  isToday: boolean;
  isFuture: boolean;
}

/** The current week, Sunday first, as the "Your focus this week" chart lays it out. */
export function weekDays(today: Date): WeekDay[] {
  const todayIndex = today.getDay();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - todayIndex + index);
    const name = day.toLocaleDateString('en-US', { weekday: 'long' });
    return { label: name[0]!, name, isToday: index === todayIndex, isFuture: index > todayIndex };
  });
}

/** 600 → "10 hour", 90 → "1.5 hour" (as in "of your 10 hour weekly goal"). */
export function formatGoalHours(mins: number): string {
  return `${Math.round((mins / 60) * 10) / 10} hour`;
}
