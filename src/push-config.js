// Public half of the VAPID key pair used for Web Push. The private half lives
// only in the repository secret VAPID_PRIVATE_KEY, used by the daily-push
// workflow. Regenerate both together if you ever rotate it.
export const VAPID_PUBLIC_KEY = 'BGTdOYBHY_75kxuLSOWVYLWqSyGX3F3I91Bp4HlgaMJvbUZxMk5Na7wnzOrA5TN2VBmZerhHBAKbovMNqydsz0w';
export const PUSH_SUBJECT = 'https://github.com/carlot78/aphorisms';
