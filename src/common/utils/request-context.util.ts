export type RequestLike = {
  ip?: string;
  socket?: { remoteAddress?: string };
  get?: (header: string) => string | undefined;
};

export function getClientIp(req: RequestLike): string {
  return extractRequestContext(req).ip ?? '';
}

export function extractRequestContext(req: RequestLike): {
  ip?: string;
  userAgent?: string;
} {
  return {
    ip: req.ip ?? req.socket?.remoteAddress,
    userAgent: req.get?.('user-agent'),
  };
}
