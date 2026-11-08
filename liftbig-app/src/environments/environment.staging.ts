// Used by `ng build --configuration staging` (ADR 0023): the staging API, for
// Ivan's emulator and phone builds. No staging build goes to Play.
export const environment = {
  production: true,
  apiUrl: 'https://staging-api.liftbig.co',
  sentryDsn: '', // no error reports from staging builds (ADR 0023 § 5)
};
