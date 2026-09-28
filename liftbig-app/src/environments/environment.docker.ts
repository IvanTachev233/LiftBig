// Used by the local Docker stack: `ng build --configuration production,docker`.
// nginx (see nginx.conf) proxies `/api/` to the liftbig_api container, so the
// browser talks to the local API instead of the production URL in environment.prod.ts.
export const environment = {
  production: true,
  apiUrl: '/api',
};
