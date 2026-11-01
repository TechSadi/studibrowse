import { AppError } from '../../lib/errors';

export const userNotFound = () => new AppError(404, 'USER_NOT_FOUND', 'We couldn’t find that person.');

export const cannotFollowSelf = () => new AppError(400, 'CANNOT_FOLLOW_SELF', 'You can’t follow yourself.');
