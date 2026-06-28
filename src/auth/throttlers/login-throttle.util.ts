export function buildLoginThrottleKey(ip: string | undefined, email: string | undefined): string {
  return `login:${ip ?? ''}:${(email ?? '').toLowerCase()}`;
}
