import { User } from './user.model';

/** `username` must already be normalised by the shared usernameSchema. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  return !(await User.exists({ username }));
}
