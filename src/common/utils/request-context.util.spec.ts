import { extractRequestContext, getClientIp } from './request-context.util';
import type { RequestLike } from './request-context.util';

function mockRequest(overrides: Partial<RequestLike> = {}): RequestLike {
  return {
    ip: undefined,
    socket: { remoteAddress: '127.0.0.1' },
    get: jest.fn(),
    ...overrides,
  };
}

describe('request-context util', () => {
  it('getClientIp prefers req.ip over socket address', () => {
    expect(getClientIp(mockRequest({ ip: '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('getClientIp falls back to socket.remoteAddress', () => {
    expect(getClientIp(mockRequest({ ip: undefined, socket: { remoteAddress: '192.168.1.5' } }))).toBe(
      '192.168.1.5',
    );
  });

  it('extractRequestContext returns ip and userAgent when both are present', () => {
    const req = mockRequest({
      ip: '10.0.0.1',
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
    });

    expect(extractRequestContext(req)).toEqual({
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('extractRequestContext falls back to socket.remoteAddress when ip is absent', () => {
    const req = mockRequest({
      ip: undefined,
      socket: { remoteAddress: '192.168.1.5' },
      get: jest.fn().mockReturnValue('curl/8.0'),
    });

    expect(extractRequestContext(req)).toEqual({
      ip: '192.168.1.5',
      userAgent: 'curl/8.0',
    });
  });

  it('extractRequestContext returns undefined userAgent when header is absent', () => {
    const req = mockRequest({
      ip: '10.0.0.2',
      get: jest.fn().mockReturnValue(undefined),
    });

    expect(extractRequestContext(req)).toEqual({
      ip: '10.0.0.2',
      userAgent: undefined,
    });
  });
});
