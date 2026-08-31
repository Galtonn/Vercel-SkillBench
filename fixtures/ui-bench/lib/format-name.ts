import type { User } from "./users";

/** Formats a user for display. Used by a non-skill-relevant rename task. */
export function formatUserName(user: User): string {
  return `${user.first} ${user.last}`;
}
