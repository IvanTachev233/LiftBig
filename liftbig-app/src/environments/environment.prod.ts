export const environment = {
  production: true,
  // The API's own domain (ADR 0016), from versionCode 4; older builds keep calling the *.run.app URL
  apiUrl: 'https://api.liftbig.co',
  // Error and crash reports (Sentry project liftbig-app, EU); a DSN is public by design. Empty = off
  sentryDsn: 'https://3a77d4baaa13f5bc146a0c2f7e87a9b5@o4512315777548288.ingest.de.sentry.io/4512339849642064',
};
