// The headline each notification shows. Pure.

export type NotificationText =
  | { type: 'roomStarted'; hostName: string }
  | { type: 'roomFull' }
  | { type: 'memberJoined'; firstName: string; count: number }
  | { type: 'roundEnded'; round: number };

export function notificationText(input: NotificationText): string {
  switch (input.type) {
    case 'roomStarted':
      return `${input.hostName} opened a room`;
    case 'roomFull':
      return 'Your room is full';
    case 'memberJoined': {
      const others = input.count - 1;
      if (others <= 0) return `${input.firstName} joined your room`;
      return `${input.firstName} and ${others} ${others === 1 ? 'other' : 'others'} joined your room`;
    }
    case 'roundEnded':
      return `Round ${input.round} complete`;
  }
}
