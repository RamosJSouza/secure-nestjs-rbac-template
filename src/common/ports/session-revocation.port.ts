export const SESSION_REVOCATION_PORT = Symbol('SESSION_REVOCATION_PORT');

export interface SessionRevocationPort {
  revokeAllUserSessions(userId: string): Promise<number>;
}
