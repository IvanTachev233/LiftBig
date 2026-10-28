# Sign-up, acceptance and consent texts (LB-32)

UI texts for G1b, and the consent wording versions G1a stores in `consent_event.textVersion`. Status: **approved by Ivan Tachev, 2026-10-21**. When a consent text changes, its version changes; the old version stays here so stored events can be matched to the words the user saw.

## Purposes

| Purpose | Required | Default | Text version | Lawful basis |
| --- | --- | --- | --- | --- |
| `health_data` | Yes, to create or keep an account | Unticked | `2026-10-21` | UK GDPR Art. 9(2)(a) explicit consent (Art. 6 basis stays contract) |
| `video_training` | No | Off | `2026-10-21` | Art. 6(1)(a) consent |
| `product_emails` | No | Off | `2026-10-21` | Art. 6(1)(a) consent; PECR reg. 22 for marketing email |

`health_data` follows the health data answer in `records-of-processing.md` § Health data check (yes, Ivan, 2026-10-21).

## Sign up

Below the password field, before the Sign up button. Links open `/terms` and `/privacy` in the browser.

**Required, unticked:**

> ☐ I'm 18 or older and agree to the [Terms of Use]. I've read the [Privacy Policy].

> ☐ I agree that LiftBig stores and uses my training data, such as workouts, lifts and notes, to run the app and to show it to a coach I link to. This data can say something about my health.

Sign up stays disabled until both are ticked. Hint under the button while disabled: "Tick both boxes to continue."

**Optional, off** (heading "Optional", toggles):

> **Help improve lift analysis**
> When you upload videos, LiftBig may use them, and what's measured from them, to train and improve its lift analysis. Video isn't in the app yet; this applies once it is.

> **News and offers by email**
> Occasional emails about LiftBig. Unsubscribe any time.

Footer line: "You can change these any time in Profile → Privacy."

## Existing users: "We've updated our terms"

Shown before the app when `needsAcceptance` isn't empty. Only Log out and Delete account work without accepting.

> **We've updated our terms**
>
> LiftBig now has Terms of Use, and our Privacy Policy explains more: what we use your data for and why, your rights, and two new choices you can make. Please read them and confirm to keep using LiftBig.

Below the intro text, show only the required checkboxes for what is in `needsAcceptance`:

- If `'terms'` is in `needsAcceptance` (first rollout, or a new Terms version): show the first required checkbox ("I'm 18 or older and agree to the [Terms of Use]. I've read the [Privacy Policy].").
- If `'health_data'` is in `needsAcceptance` (first rollout, or a new `health_data` text version): show the second required checkbox ("I agree that LiftBig stores and uses my training data...").
- If only `'privacy'` is in `needsAcceptance`: no checkbox (see below).

Below the required checkbox(es), show the two optional toggles (`video_training` and `product_emails`) only if the user hasn't made a choice on them yet (otherwise they stay in Profile → Privacy). Primary button **Continue** (disabled until all shown required boxes are ticked). Text buttons: **Log out**, **Delete account**. Continue records acceptance of every document listed in `needsAcceptance`, at its current version.

When only one item changed on a later update, the heading and intro name it:

- **Terms of Use changed**: "We've updated our Terms of Use". Requires ticking the Terms/Privacy checkbox to continue.
- **Privacy Policy changed (material update, no new consent needed)**: "We've updated our Privacy Policy". An informational notice with a link to `/privacy` and a **Continue** button; no checkbox unless a consent text version also changed. Continue records that the new version was shown.

### Heading and intro by what is listed

Status: **proposed 2026-10-24, awaiting Ivan's approval** (adds the intros the lines above leave open, and replaces the first-rollout intro for later updates). The first-rollout intro is used when all three are listed and the user has never given the `health_data` consent (no earlier event); a later release that changes all three gets the "any other combination" intro.

| Listed in `needsAcceptance` | Heading | Intro |
| --- | --- | --- |
| `terms`, `privacy` and `health_data`, no earlier `health_data` consent | We've updated our terms | The first-rollout intro above |
| `terms` only | We've updated our Terms of Use | We've changed our Terms of Use. Please read them and tick the box to keep using LiftBig. |
| `privacy` only | We've updated our Privacy Policy | We've changed our Privacy Policy. Please read what's new; there's nothing new to agree to. |
| `health_data` only | Please confirm how we use your training data | We've reworded what you agree to about your training data. Please read it and tick the box to keep using LiftBig. |
| Any other combination | We've updated our terms | We've changed some of what you agreed to. Please read the changes and confirm to keep using LiftBig. |

## Profile → Privacy

Rows, in order:

- **Help improve lift analysis**: toggle, with the text from Sign up.
- **News and offers by email**: toggle, with the text from Sign up.
- **Training data**: no toggle. "You agreed on <date>. LiftBig can't log your training without it. To withdraw it, delete your account." "Delete account" opens the existing delete sheet.
- **Terms of Use**: opens `/terms`. Subtitle "Version <TERMS_VERSION>".
- **Privacy Policy**: opens `/privacy`. Subtitle "Version <PRIVACY_VERSION>".
- **Request a copy of my data**: opens `mailto:tachev.ivan1@gmail.com?subject=LiftBig%20data%20request` (the address comes from `PRIVACY_CONTACT_EMAIL`). Subtitle "We'll email it to you within a month."

Toasts after a toggle is saved: "Video training turned on." / "Video training turned off." / "Emails turned on." / "Emails turned off." When the call fails, the toggle goes back and says "Couldn't save. Check your connection."

## Version history

- `2026-10-21`: first versions of all three purposes, approved by Ivan Tachev on 2026-10-21.
