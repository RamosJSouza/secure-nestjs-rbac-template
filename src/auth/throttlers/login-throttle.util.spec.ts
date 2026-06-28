import { buildLoginThrottleKey } from './login-throttle.util';

describe('buildLoginThrottleKey (S6)', () => {
  it('combines IP and email into a stable key', () => {
    expect(buildLoginThrottleKey('1.2.3.4', 'a@b.com')).toBe('login:1.2.3.4:a@b.com');
  });
  it('lowercases the email', () => {
    expect(buildLoginThrottleKey('1.2.3.4', 'A@B.COM')).toBe('login:1.2.3.4:a@b.com');
  });
  it('handles missing email (unparsed body)', () => {
    expect(buildLoginThrottleKey('1.2.3.4', undefined)).toBe('login:1.2.3.4:');
  });
});
