import { User } from './auth.service';

/** A JWT that jwtDecode accepts; the signature is not checked */
export function fakeToken(role: User['role'], claims: Partial<User> = {}) {
  const payload = btoa(JSON.stringify({ id: 'u1', email: 'u@x.io', role, ...claims }));
  return `header.${payload}.signature`;
}
