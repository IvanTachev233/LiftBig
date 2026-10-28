# Records of processing (UK GDPR Art. 30)

LiftBig's record of what personal data it processes, why, on what basis, for how long and with whom. The privacy policy (`privacy-policy.md`, served at `/privacy`) and the Play Data safety answers (`liftbig-design-handoff/play-store/data-safety.md` in the private notes repo, cloned at `notes/`) are checked against this file; when a data item, purpose or provider changes, update all three together.

Status: **approved by Ivan Tachev, 2026-10-21**. Reflects the code on 2026-10-21 (API and app on `LB-Fix-Min-Rep-Missing`) plus the tables G1a adds (`policy_acceptance`, `consent_event`). Neon region added 2026-10-22 (O1 closed).

2026-10-28 (T1 A3b): error and crash reports with Sentry (P10, Sentry processor, device storage rows, § Error reports check, § Sentry settings, item-by-item rows, O7, O8). Status: **approved by Ivan Tachev, 2026-10-28**, with privacy policy version `2026-10-28`; ADR 0019 stays Proposed. Describes the configuration that A3c (API) and A3e (app) must build; nothing is sent before they ship.

Small organisations can skip some Art. 30 records, but not when processing is regular or includes special category data; both apply here, so this record is kept in full.

## Controller

| | |
| --- | --- |
| Controller | Ivan Tachev (`PRIVACY_OPERATOR_NAME` in production) |
| Contact | <tachev.ivan1@gmail.com> (`PRIVACY_CONTACT_EMAIL`) |
| Data protection officer | None (not required) |
| ICO registration | Not registered (Ivan's decision, 2026-10-21); see § ICO data protection fee |

## Data subjects

- **Clients**: users who sign up to log training, alone or with a coach.
- **Coaches**: users who write programs and workouts for clients.
- **Invitees**: people whose email a coach types into an invite, before they have an account.
- **Visitors** to the public pages (`/privacy`, `/terms`, `/delete-account`): request logs, and an error report when their request fails on the server (P10).

All users are 18 or older (Terms § 2, sign-up checkbox).

## Processing activities

| # | Purpose | Data (tables) | Subjects | Art. 6 basis | Art. 9 condition | Retention |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Account: sign-up, sign-in, email codes | Email, name, password hash, role, `emailVerifiedAt` (`user`); email codes as hashes (`email_code`) | Clients, coaches | Contract | — | Until account deletion. Codes unusable after 15 min; rows removed at the next request for that purpose after an hour, or with the account |
| P2 | Sessions and account security | `auth_session` (token hashes, created, last used, expiries, revoked); `tokenVersion`, `failedPasswordAttempts`, `passwordLockedUntil` (`user`) | Clients, coaches | Legitimate interests (account and service security), and contract | — | Session ends after 30 days unused or 90 days; ended rows removed at the user's next sign-in, or with the account |
| P3 | Training log | `workout`, `workout_exercise` (incl. coach note for athlete), `workout_set` (planned and actual reps, weight, made, notes), `rep_max_entry`, `user_best_lift`, `program_enrollment` (start date, maxes), settings (`weightUnit`, `restSeconds`) | Clients, coaches (own workouts) | Contract | 9(2)(a) explicit consent `health_data` (§ Health data check) | Until account deletion, or until the user deletes the item |
| P4 | Coaching: link, invites, assigned workouts, coach content | `coachId` (`user`); `invite` (coach, client email, token, status, expiry); workouts with `assignedById`; coach's `exercise` and `program_template` rows | Clients, coaches, invitees | Contract (users); legitimate interests of the coach and invitee (invites) | 9(2)(a) as P3 for the client's training data | Invites: until accepted, or deletion of the coach's account or the invitee's account; **no expiry purge** (open item O3). Coach content: anonymised on coach deletion and kept in clients' history |
| P5 | Terms acceptance and consent records (G1a) | `policy_acceptance` (document, version, acceptedAt, source, appVersionCode); `consent_event` (purpose, granted, textVersion, createdAt, source) | Clients, coaches | Legitimate interests (showing what was agreed; Art. 7(1) accountability for consent) | — | Until account deletion (Plans.md § LB-32 assumption). Note for L1/V6: when a clip is included in a training dataset snapshot, Vision records the opaque `subjectId` and consent event timestamp/version in the dataset manifest so auditability survives LiftBig account deletion (see O5). |
| P6 | Video training (future, L2) | Uploaded videos and measurements from them | Users who opted in | Consent `video_training` | Re-check when video ships (open item O5) | Defined when video ships; nothing is stored yet |
| P7 | News and offers email (future) | Email, name, `product_emails` consent | Users who opted in | Consent `product_emails` (PECR reg. 22) | — | Until withdrawn or account deletion; no such emails are sent yet |
| P8 | Hosting request logs | IP address, time, method and path, user agent, status (Cloud Run request logs) | All users, visitors | Legitimate interests (running and protecting the service) | — | Cloud Logging `_Default` bucket: 30 days (Google's default; keep it unless this record and the policy change too) |
| P9 | Backups | Copy of the whole database | All | As for the source data | As P3 | Neon point-in-time restore window: 6 hours on Neon Free; up to 7 days on Launch, the plan for the Play production rollout (`docs/production-readiness-plan.md` § Costs). The policy states the upper bound, 7 days |
| P10 | Error and crash reports (Sentry; A3c API, A3e app) | **API events:** exception type, message, stack trace; release (git SHA), environment; server runtime details; request method, URL path (no query string), headers minus `Authorization`, `Cookie`, `Set-Cookie` and IP-carrying headers (`X-Forwarded-For`, `Forwarded`, `X-Real-IP` and the like), response status; `user.id` = the account's UUID (`user` table `id`) when the request was authenticated. No request body, no IP. **App events:** JS and native Android exceptions and crashes with stack traces; release (versionName, versionCode as dist); device context (maker, model, Android version, locale, time zone, memory, storage, battery, orientation, emulator and rooted flags); breadcrumbs of route changes and API calls (method, URL, status; no bodies); Sentry's random `installationId` as the user (no account id, no `setUser`); release health sessions (start, end, crashed). No console or tap breadcrumbs, no IP | All app users; signed-in users and visitors (API) | Legitimate interests (finding and fixing faults; § Error reports check) | None intended: training data, email and name are kept out by configuration (§ Sentry settings); a stray value in an exception message is the residual risk, covered by the scrubbers | Sentry Developer plan: 30 days; Team plan and the trial a new organisation starts on: 90 days. The policy states the upper bound, 90 days. Not deleted on account deletion; on an erasure request, delete the account's API events by `user.id` in Sentry |

Not processed: location, contacts, photos or videos (until P6), payment data, advertising IDs, analytics, hardware device IDs (`ANDROID_ID`). Crash reports and Sentry's per-installation id only as P10. No profiling, no automated decisions with legal or similar effects, no sale or sharing.

### On the device (app)

Not processing by a provider, but listed for the policy and PECR reg. 6 (storage that's strictly necessary for the service the user asked for, so no consent needed):

| Item | Where | Removed |
| --- | --- | --- |
| Refresh token | Android Keystore-backed secure storage (web build: `localStorage`) | Sign-out, session end, uninstall |
| Theme choice | `localStorage` | Uninstall |
| Read cache: workout list, exercise list, up to 20 opened workouts, per user | Capacitor Preferences (`read-cache.<userId>`) | After 30 days, or uninstall; **not cleared on sign-out or account deletion** (open item O4) |
| Outbox: workout changes waiting to be sent, per user | Capacitor Preferences | Once sent (2xx), dropped on a 4xx, after 30 days, or uninstall |
| Sentry `installationId` (random, per installation) and reports or sessions not yet sent (A3e) | App storage of the Sentry Android SDK | Reports once sent; the id at uninstall. PECR: § Error reports check |

`android:allowBackup="false"`, so none of it goes into Google backups.

## Recipients

### Processors

| Provider | Role | Data | Location | Transfer safeguard | DPA |
| --- | --- | --- | --- | --- | --- |
| Google Cloud (Cloud Run, Cloud Logging, Secret Manager) | Hosts the API and its logs | All API traffic, request logs (P1–P8); secrets hold no user data | `europe-west1` (Belgium) | UK adequacy regulations for the EEA; anything else under Google Cloud's data processing terms | Google Cloud Data Processing Addendum, part of the Cloud terms |
| Neon | Database host | Whole database (P1–P7, P9) | AWS `eu-west-2` (London, UK); Ivan, 2026-10-22 | None needed for storage in the UK; Neon's DPA for any access from elsewhere | Neon DPA |
| Resend | Sends email codes | Recipient email, the email body (with the code) | Account data, email metadata and logs stored in the United States whatever the sending region (Resend docs, "Choosing a Region", read 2026-10-21) | Resend's DPA | Resend DPA, pre-signed by Resend and in force on account sign-up (Resend docs, "Downloading Documents") |
| Sentry (Functional Software, Inc., US) | Receives and stores error and crash reports | P10 only | EU data storage location: Frankfurt, Germany (events, release health, releases, backups). Organisation, project and account metadata, DSN keys and anything put in a support ticket stay in the US (Sentry docs, "Data Storage Location", read 2026-10-28); no user data goes there if § Sentry settings are kept | UK adequacy regulations for the EEA; access from the US under Sentry's DPA (mechanism to record when accepting it, O7) | Sentry DPA, accepted in Organization Settings › Legal & Compliance when the organisation is created (Ivan) |

### Other recipients

- **The user's coach** (P4): while linked, sees the client's name and email and the workouts the coach assigned, with how they were logged and their notes (and, once available, videos of those workouts). Coaches don't see a client's own workouts, lift records or program maxes (`coach-workouts.service.ts` `findForClient` and `auth.service.ts` `getClients` filter on `assignedById`). The client's own choice (linking), not a disclosure by LiftBig.
- **YouTube (Google) and Vimeo**, independent controllers: when a user opens an exercise whose `videoUrl` is a YouTube or Vimeo link, the app shows the player in an iframe (`exercise-detail-modal.component.ts`), which loads from `www.youtube.com` / `player.vimeo.com` straight away, so they get the user's IP address and device details and may set cookies. LiftBig sends them no user data. Open item O2.
- **Google Play**: distributes the app; Google's own controller relationship with the user, not LiftBig processing.
- **Authorities**: only when required by law.

## Security measures

HTTPS only (release build blocks cleartext; API to Neon over TLS, to Resend over HTTPS); passwords hashed with bcrypt; email codes and refresh tokens stored only as hashes; wrong-password lock on Change password and web deletion; refresh token in Keystore-backed storage; `allowBackup=false`; secrets in Secret Manager; public pages with CSP and `nosniff`; account deletion in the app and on the web; error reports scrubbed before they leave the API or the app, with Sentry's server-side scrubbing and IP storage off as a second layer (§ Sentry settings).

## Error reports check (P10)

**Legitimate interests.** Purpose: find and fix crashes and server errors, which users can't report in useful detail and which the request logs (P8) don't show on the device. Necessity: without reports, a crash on a tester's phone is invisible; a report needs the error, the version and the device type to be fixed. Data is cut to that: no training data, email, name, IP or tokens; the app identifies only an installation (random, reset on reinstall) and the API only an account UUID, to group reports and to answer an erasure request. Balance: users expect an app to be kept working; nothing is used for marketing, profiling or decisions about a person; reports are deleted within 90 days. Users can object (policy § Your rights); since there's no per-user switch, an objection is handled by email, and a toggle in Profile → Privacy is the follow-up if anyone asks (O8). Result: legitimate interests fits, no consent needed under UK GDPR.

**PECR reg. 6 (storing and reading on the device).** The Sentry Android SDK stores its id and unsent reports on the phone and reads device state. Since 5 February 2026 (Data (Use and Access) Act 2025, Commencement No. 6), regulation 6 applies subject to Schedule A1, whose "strictly necessary" exception gives "preventing or detecting technical faults" as an example (ICO, "Guidance on the use of storage and access technologies" › "What are the exceptions?", read 2026-10-28; the guide notes it's under review). Crash reporting for the service the user asked for is fault detection, so no consent is needed, as long as the SDK does only that: no performance tracing, session replay, profiling, logs or user feedback, which would fall outside it. Release health sessions (crash-free rate) count as fault detection here. Recheck if the ICO's updated guidance says otherwise.

**Decision:** legitimate interests, no toggle (Plans.md § T1 assumption); Ivan Tachev, 2026-10-28, by approving these texts.

## Sentry settings

Settings that keep P10 and the policy true. Ivan sets the console ones when creating the organisation (before A3c's test event); A3c and A3e build the SDK ones; ADR 0019 lists them too.

- Console: **Data Storage Location: European Union** at organisation creation (can't be changed later; the only way back is a new organisation); Developer plan after the trial; DPA accepted (Legal & Compliance); **Service Data Usage**: no opt-in to model training; no generative AI features (Seer, issue summaries) unless this record is updated; per project **Security & Privacy**: Data Scrubber and default scrubbers on, **Prevent Storing of IP Addresses** on. Never paste event data into a Sentry support ticket (it would be stored in the US).
- API (A3c): off without `SENTRY_DSN`; `sendDefaultPii` off (no `dataCollection` object, which would turn every category on); `beforeSend` drops the request body, query string, cookies and `Authorization`, `Cookie`, `Set-Cookie` and IP-carrying headers, and any `user` field other than `id`; `user.id` only from the authenticated JWT; release = git SHA; errors only (no `tracesSampleRate`, profiling or logs).
- App (A3e): DSN only in `environment.prod.ts`; no `setUser`; no tracing, replay, feedback or logs; console and tap (UI click) breadcrumbs off; HTTP breadcrumbs keep method, URL and status only; `beforeSend` drops any `user` field other than the installation id and any request body; release = versionName, dist = versionCode.

## Health data check

**Question:** does anything LiftBig stores count as health data (UK GDPR Art. 4(15), special category under Art. 9)?

**What's stored:** no body weight, heart rate, sleep, injury, pain, RPE or readiness fields (checked in the entities and app on 2026-10-21; "body weight" appears nowhere). Stored: logged reps and weights, rep maxes and best lifts over time, program maxes, and free-text notes on workouts, cards (the coach's note for athlete) and sets. Coaches see the workouts they assigned, with results and notes.

**ICO guidance** (ico.org.uk, "What is special category data?", read 2026-10-21): health data is personal data related to physical or mental health and includes "any information on injury, disease, disability or disease risk"; the ICO lists "data from fitness trackers" as an example. Inferred data counts when you intend to make an inference or treat people differently because of it; just holding data from which someone might infer something doesn't need a condition, but the risk should be handled fairly.

**Assessment:** the numbers alone are performance data and LiftBig draws no health inferences from them. But (a) the ICO names fitness tracker data as health data, and a strength log over time is close to it; (b) the free-text notes invite entries like "left knee hurt on the last set", which is information on injury, and coaches write notes about a client's training; (c) video analysis (L2) will make the question harder, not easier. Counting it now costs one checkbox at sign-up; finding out later means asking every user again, which G1 exists to avoid.

**Answer: yes.** Treat the training log (P3, and P4 for clients' training) as health data, with **explicit consent** (Art. 9(2)(a)) as the condition: a required, separate, unticked checkbox `health_data` at sign-up and on the update screen (`consent-texts.md`). No other Art. 9 condition fits a consumer app (9(2)(h) is for health professionals). Explicit consent needs no appropriate policy document. The consent is required for the service because the service is the processing, which is acceptable here; withdrawing means deleting the account (stated in the policy and Profile → Privacy). The Art. 6 basis stays contract.

Consequence for G1a/G1b: purpose `health_data`, required at register (400 when missing, like `acceptTerms`), listed in `needsAcceptance` until granted at the current text version, shown in Profile → Privacy without a toggle.

Revisit when body weight, injury or pain fields, or video ship.

**Decision:** yes (Ivan Tachev, 2026-10-21, by approving these texts).

## ICO data protection fee

**Answer:** the fee applies. LiftBig processes users' personal data with automated means for a service offered to the public, so the exemptions (staff administration, own accounts and records, personal or household affairs, not-for-profit, non-automated) don't fit. Tier 1 (micro organisation: up to 10 staff or turnover up to £632,000): **£52 a year, £47 by direct debit**; not paying risks a fixed penalty (£400 at tier 1). Sources: ICO data protection fee guide and self-assessment results page, read 2026-10-21; figures are the February 2025 rates, no later change found.

**Decision:** not registering (Ivan Tachev, 2026-10-21). Risk accepted: the fee itself plus a fixed penalty (£400 at tier 1, up to £4,350) if the ICO finds the fee unpaid. The ICO's free self-assessment (ico.org.uk, data protection fee → self-assessment) would confirm whether an exemption applies; if it does, record the result here. Revisit before the Play production rollout (LB-27 R14) or when LiftBig earns money.

**Status:** decided; not registered.

## Item-by-item check

Each item in the privacy policy, where it sits here, and its Play Data safety answer.

| Privacy policy item | Records | Data safety (`data-safety.md`) |
| --- | --- | --- |
| Email address | P1 | Personal info › Email address |
| Name | P1 | Personal info › Name |
| Password hash | P1 | No type; account creation "Username and password" |
| Role | P1 | App activity › Other actions |
| Coach link | P4 | App activity › Other actions |
| Settings (weight unit, rest timer) | P3 | App activity › Other actions |
| Workouts (name, date, start time, notes, status) | P3 | Health and fitness › Fitness info; notes also App activity › Other user-generated content |
| Sets (planned and logged reps and weight, made, notes incl. coach notes) | P3 | Fitness info; notes also Other user-generated content |
| Lift records | P3 | Fitness info |
| Program enrollments | P3 | Fitness info |
| Coach's exercises, programs, invites | P4 | Other user-generated content; invite email under Email address |
| Email codes | P1 | No separate type (Account management) |
| Sessions | P2 | No Play type (server-side, Account management); row in `data-safety.md` § Pending with LB-32 |
| Sign-in security data | P2 | No Play type |
| Terms and policy acceptance | P5 | No Play type (Account management); row in § Pending with LB-32 |
| Consent choices | P5 | App activity › Other actions; row in § Pending with LB-32 |
| Request logs (30 days) | P8 | Not declared (open check in `data-safety.md` on IP addresses stays) |
| Error and crash reports: what went wrong, version | P10 | App info and performance › Crash logs (`data-safety.md` § Pending with Sentry; purpose App functionality, not Analytics) |
| Error and crash reports from the app: device make, model, Android version, language, time zone, device state (incl. rooted and emulator flags) | P10 | App info and performance › Diagnostics |
| Error and crash reports from the app: screens opened and server requests made before the error | P10 (breadcrumbs) | App activity › App interactions |
| Error and crash reports from the app: random installation id, session counts | P10, § On the device | Device or other IDs |
| Error and crash reports from the server: request kind and address, browser or app type, result, account id | P10 | No Play type (server-side data about requests the app already made) |
| What reports never include (training data, email, name, password, tokens, IP) | P10, § Sentry settings | Nothing added under Personal info, Health and fitness or Location |
| On your device: token, theme, offline copy, waiting changes | § On the device | Not "collected" (stays on the device); nothing to declare |
| On your device: Sentry id and unsent reports | § On the device | Collected once sent: Device or other IDs, Crash logs, Diagnostics (rows above) |
| Lawful basis table | P1–P8, P10 | — |
| Training data and your health (explicit consent) | P3, § Health data check | Fitness info stays the declared type. Health info (medical records, symptoms) isn't collected on purpose; free-text notes stay under Other user-generated content |
| Your choices: `video_training`, `product_emails` | P6, P7 | Nothing collected yet. When video ships: Photos and videos › Videos; when emails are sent: no new type (email already declared), purpose "Marketing" added to Email address |
| Coach sees assigned workouts | Other recipients | Not sharing (the user's own choice) |
| Google Cloud, Neon, Resend, Sentry | Processors | Service providers: "Shared: No" |
| YouTube and Vimeo players | Other recipients, O2 | Not declared so far. **Check Play's Data safety help on embedded web content before the next submission** |
| Data outside the UK | Processors | — |
| No ads, analytics or tracking (error reports only to fix faults); no sale; no automated decisions | § Processing activities | Ads "No". Before the first Sentry build: nothing under App info and performance or Device or other IDs; from it on, only the P10 rows above |
| Retention table (error reports within 90 days, backups within 7 days) | Retention column, P9, P10 | Step 1 deletion answers |
| Request logs, error reports and backups not deleted with the account | P8, P9, P10 retention | — |
| Deleting your account (client deleted, coach anonymised; acceptance and consent rows go too) | P1–P5 retention | Delete account URL. **G1a must delete `policy_acceptance` and `consent_event` rows in `account-deletion.ts`** |
| Your rights, ICO complaint | — | Step 1: deletion without deleting the account stays "No" until a request process exists; the "Request a copy of my data" email link (G1b) covers access requests |

## Open items

- **O1** Closed 2026-10-22: Neon region is AWS `eu-west-2` (London).
- **O2** YouTube and Vimeo players load as soon as the exercise detail opens, before the user plays anything, so those services can set cookies without consent (PECR reg. 6 needs consent for non-essential storage). Suggested fix (app, small): show a poster with "Play video (from YouTube)" and load the iframe only on tap, using `www.youtube-nocookie.com/embed/` and Vimeo's `?dnt=1`. Fits G1b, or a follow-up; Ivan to decide.
- **O3** Expired invites are never removed; an invitee who never signs up stays in the `invite` table until the coach deletes their account. Suggested: delete invites some days after `expiresAt` (follow-up).
- **O4** The device read cache stays up to 30 days after sign-out or account deletion. Suggested: clear the user's read cache and outbox on account deletion (follow-up; the policy says "after 30 days" meanwhile).
- **O5** Before video ships (L2): DPIA (special category data plus new technology), update P6 and the policy, and re-check the Art. 9 position for video. The policy then also has to say that a dataset manifest keeps the opaque `subjectId` and consent version after account deletion (P5 note), and for how long.
- **O6** Coaches who coach for a living may be controllers of their client data themselves; a qualified review should say whether the Terms need coach-specific clauses.
- **O7** When accepting Sentry's DPA, record here which transfer safeguard covers access from the US (Standard Contractual Clauses with the UK Addendum or IDTA, or the Data Privacy Framework's UK Extension) and that the DPA covers the EU organisation. Until then the policy says only "the safeguards in each provider's data processing agreement".
- **O8** Error reports have no per-user switch (§ Error reports check). If a user objects, or the ICO's updated guidance treats crash reporting as outside "strictly necessary", add an "Error reports" toggle to Profile → Privacy (a setting, not a consent purpose in `consent_event`) and a policy version.
