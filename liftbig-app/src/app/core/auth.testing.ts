import { User } from './auth.service';

/** A JWT that jwtDecode accepts; the signature is not checked */
export function fakeToken(role: User['role']) {
  const payload = btoa(JSON.stringify({ id: 'u1', email: 'u@x.io', role }));
  return `header.${payload}.signature`;
}
