# LiftBig privacy policy — text for `/privacy`

Text for LB-32, to replace the body of `liftbig-api/src/public-pages/privacy-page.ts` in G1a. Status: **approved by Ivan Tachev, 2026-10-21**. Neon region added 2026-10-22. The page takes the operator and contact from `PRIVACY_OPERATOR_NAME` / `PRIVACY_CONTACT_EMAIL`; the values are written out here. Checked against `records-of-processing.md` item by item.

Version `2026-10-28` (T1 A3b): adds error and crash reports (Sentry). Status: **approved by Ivan Tachev, 2026-10-28**. A3c puts it on the page and bumps `PRIVACY_VERSION`; until then `/privacy` serves `2026-10-21`, whose text stays in this file's git history (notes repo). Changes: the "What's new" line, "What we store" › Error and crash reports, "On your device", the legal basis table, "Who sees your data", "Data outside the UK", "What we don't do", "How long we keep it", "Deleting your account". A privacy-only change, so existing users get the notice, not a checkbox (`consent-texts.md`); no consent text changes.

`PRIVACY_VERSION = '2026-10-28'`

Headings below sit one level under the page's: `##` here is the page `<h1>`, `###` its `<h2>`.

---

## Privacy policy

Version 2026-10-28 · Last updated 28 October 2026

What's new in this version: the app and the LiftBig server now send error and crash reports to Sentry, so we can find and fix faults (see "Error and crash reports" below).

This policy explains what the LiftBig app stores about you, why, on what legal basis, who handles it for us, how long we keep it, and your rights. LiftBig is for people aged 18 or over.

### Who runs LiftBig

LiftBig is run by Ivan Tachev ("LiftBig", "we", "us"), the controller of your personal data. Questions about your data or this policy: <tachev.ivan1@gmail.com>.

### What we store

Your account:

- **Email address**: to sign in and to send you email codes.
- **Name**: shown in the app and to your coach.
- **Password hash**: a one-way hash of your password; the password itself is never stored.
- **Role**: whether you are a coach or a client.
- **Coach link**: the coach you train with, if any.
- **Settings**: your weight unit (kg or lb) and rest timer length.

Your training:

- **Workouts**: your own workouts, those a coach assigned you and those from a program you follow, with their name, date, start time, notes and status.
- **Sets**: the planned and logged reps and weight of each set, whether you made it, and notes, including notes your coach writes for you.
- **Lift records**: your rep maxes and best lifts.
- **Program enrollments**: the programs you follow, their start date and the maxes you entered.
- If you are a coach: the **exercises** you create, the **programs** you write and the **invites** you send. An invite holds the email address you typed in, so that person can join you.

Keeping your account safe:

- **Email codes**: the one-time codes that confirm your email and reset your password, stored only as a hash. A code stops working after 15 minutes.
- **Sessions**: for each device you're signed in on, a hash of its sign-in token and when it started and was last used.
- **Sign-in security data**: a count of wrong passwords and a temporary lock, and a counter that signs out your other devices when you change your password.

Your agreements and choices:

- **Terms and policy acceptance**: which version of the Terms of Use you accepted and which version of this policy you were shown, when, and from which app version.
- **Consent choices**: each time you give or withdraw a consent (see "Your choices"), which one, the wording version you saw, and when.

Our hosting provider also keeps standard request logs (such as IP address, time and the address requested) to run and protect the service.

### Error and crash reports

When the app crashes or the LiftBig server runs into an error, a report goes to our error tracking provider, Sentry, so we can find and fix the fault. A report holds:

- **What went wrong**: the type of error, its message and where in the code it happened.
- **Version**: the app version, or the server version.
- **From the app**: your phone's make and model, Android version, language and time zone, and its state at the time (such as free memory and storage, battery level, screen orientation, and whether it's rooted or an emulator); the screens you opened and the server requests the app made just before the error (the address and the result, not what was sent); and a random id that the reporting tool creates when the app is installed. That id isn't your account, your phone's hardware id or an advertising id, and a new one is made if you reinstall the app. The tool also counts app sessions and whether they ended in a crash.
- **From the server**: the kind of request that failed (such as "save a set"), its address without any search terms, your device's browser or app type, the result, and your LiftBig account's internal id (a random code, not your email or name) when you were signed in.

Reports never include your workouts, sets, notes or other training data, your email address, name or password, your sign-in tokens, or your IP address: the app and the server leave out what you send in a request and its sign-in and cookie headers, the server also removes IP addresses before a report leaves it, and Sentry is set not to store IP addresses.

### On your device

The app keeps your sign-in token (in the phone's secure storage), your theme choice, a copy of the workouts and exercises you last opened so you can use them offline, and workout changes waiting to be sent. Waiting changes are removed once they're sent, or after 30 days; the offline copy after 30 days. The error reporting tool keeps its random id and any reports waiting to be sent. Uninstalling the app removes all of it. LiftBig uses no cookies, advertising IDs or trackers.

### Why we use it, and our legal basis

| What we do | Data | Legal basis |
| --- | --- | --- |
| Create and run your account, sign you in, send email codes | Account, email codes, sessions | Contract: needed to provide the app you signed up for |
| Store and show your training, work out personal bests, run programs | Training data | Contract, and your explicit consent because training data can say something about your health (see below) |
| Let you and your coach work together | Name, email, coach link, invites, the workouts your coach assigns you | Contract, and your explicit consent for training data |
| Keep accounts secure: wrong-password locks, signing out other devices, request logs | Sign-in security data, sessions, request logs | Legitimate interests: protecting your account and the service |
| Find and fix crashes and errors | Error and crash reports | Legitimate interests: keeping LiftBig working for you. Reports leave out your training data, email, name and IP address |
| Keep a record of what you agreed to and chose | Acceptance and consent records | Legitimate interests: being able to show what you agreed to and chose, which the law expects of us for consent |
| Use your videos to train and improve lift analysis (only once video features exist) | Videos you upload and what's measured from them | Your consent (`video_training`), off unless you turn it on |
| Email you LiftBig news and offers | Email address, name | Your consent (`product_emails`), off unless you turn it on |

Giving us your email, name and password is needed to have an account. Everything else is up to you.

### Training data and your health

Your workouts, lifts and notes can say something about your health, for example your strength over time or an injury you mention in a note. Under data protection law this may be health data, so we ask for your **explicit consent** to store and use it when you sign up. We use it only to run the app for you and to show it to a coach you link to. LiftBig can't log your training without it, so to withdraw this consent you delete your account (see below) or email us and we delete it for you.

Please don't put medical details in notes that you don't want stored or seen by your coach.

### Your choices

These are optional, off unless you turn them on, and never a condition of using LiftBig:

- **Help improve lift analysis** (`video_training`): when you upload videos, LiftBig may use them, and what's measured from them, to train and improve its lift analysis. Video features aren't in the app yet; this choice applies once they are.
- **News and offers by email** (`product_emails`): occasional emails about LiftBig. Each email also has an unsubscribe link.

Change either at any time in **Profile → Privacy**; withdrawing is as easy as giving. Withdrawing doesn't affect what we did before (including models already trained), but from then on we stop and won't include your videos in future training sets.

### Who sees your data

- **Your coach**: while you are linked to a coach, they see your name, your email and the workouts they assign you, including how you logged them and your notes on them (and, once available, your videos of those workouts). They don't see your own workouts, lift records or program maxes.
- **Service providers** that handle data for us, under data processing agreements that only let them use it to provide their service to us:
  - **Google Cloud** (Cloud Run, Belgium) hosts the LiftBig server and its request logs.
  - **Neon** hosts the database where your data is stored (AWS London, UK).
  - **Resend** sends our emails: it receives your email address and the email we send you, and stores its records in the United States.
  - **Sentry** receives and stores the error and crash reports (EU data region, Frankfurt, Germany).
- **Exercise videos**: some exercises show a video from **YouTube** or **Vimeo**. When you open such an exercise, the player loads from that service, which receives your IP address and device information and may store cookies under its own privacy policy. LiftBig doesn't send them anything about you.
- **Others**: only if the law requires it, for example a court order.

### Data outside the UK

Your data is stored in the UK (the Neon database is in London). Some of our providers process data outside the UK: Google Cloud runs the LiftBig server in the EU and Sentry stores error and crash reports in the EU (Germany), which the UK recognises as giving adequate protection. Resend stores its records in the United States, and Neon, Google and Sentry (a US company) may process data elsewhere to run their services; those transfers are covered by the safeguards in each provider's data processing agreement. Ask us for details.

### What we don't do

- No ads.
- No analytics or tracking. Error and crash reports are used only to find and fix faults.
- We don't sell your data or share it with anyone other than the people and providers above.
- No automated decisions that have legal or similarly significant effects on you.

### How long we keep it

| Data | Kept |
| --- | --- |
| Account, training, settings, acceptance and consent records | Until you delete your account |
| Email codes | Stop working after 15 minutes; removed at your next code request after an hour, or with your account |
| Sessions | Until you sign out or the session ends (30 days unused, 90 days at most); removed at your next sign-in, or with your account |
| Invites | Until accepted, or until the coach or the invited person deletes their account |
| Request logs | 30 days |
| Error and crash reports | Deleted automatically within 90 days |
| Database backups | Overwritten within 7 days |

### Deleting your account

In the app, open **Profile → Delete account**. Without the app, use the [account deletion page](delete-account).

- **Client**: your account and everything in it are deleted: workouts, sets, lift records, program enrollments, settings, email codes, sessions, acceptance and consent records, and pending invites to your email.
- **Coach**: your account is anonymised: your email, name and password are removed and it can no longer sign in. Your own workouts, your invites, and your acceptance and consent records are deleted and your clients are unlinked from you. The exercises you created, the programs you wrote and the workouts you assigned stay in your clients' history, without your name or email.

Request logs, error and crash reports and backups aren't deleted with your account; they're deleted on the schedule in "How long we keep it".

### Your rights

You can ask us to:

- give you a copy of your data (access), including in a machine-readable form (portability);
- correct it (you can change your name and settings in the app);
- delete it (you can delete your account in the app);
- restrict or object to how we use it, where we rely on legitimate interests;
- stop using it for anything you consented to, by withdrawing that consent.

Email <tachev.ivan1@gmail.com>. We answer within one month. If you're unhappy with how we handle your data, you can complain to the Information Commissioner's Office (ICO): ico.org.uk/make-a-complaint, 0303 123 1113. We'd appreciate the chance to sort it out first.

### Changes to this policy

When this policy changes, the version and date above change. If a change matters to you, the app tells you the next time you open it. We ask for your consent again only for new optional uses.

### Contact

Ivan Tachev, <tachev.ivan1@gmail.com>
