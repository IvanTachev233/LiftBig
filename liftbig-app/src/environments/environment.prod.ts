export const environment = {
  production: true,
  apiUrl: 'https://liftbig-api-672384368199.europe-west1.run.app', // Replace with your Google Cloud Run service URL after deployment (e.g., https://liftbig-api-xxxxx-uc.a.run.app)
  // Error and crash reports (Sentry project liftbig-app, EU); a DSN is public by design. Empty = off
  sentryDsn: 'https://3a77d4baaa13f5bc146a0c2f7e87a9b5@o4512315777548288.ingest.de.sentry.io/4512339849642064',
};
