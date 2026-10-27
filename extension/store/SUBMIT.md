# Submitting Kaak to the stores

Everything you need is in this folder: text in [`listing.md`](listing.md), images in `images/`, the privacy
policy in [`privacy-policy.html`](privacy-policy.html). Only you can do the steps below: they need your
accounts, and each store's review takes your name as publisher (**Fahim Ahmed**, never "Theos Lab").

Checked against the stores' own docs on 2026-10-27:
[Edge: publish](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension),
[Edge: developer account](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account),
[Opera: publishing guidelines](https://help.opera.com/en/extensions/publishing-guidelines/),
[Opera: acceptance criteria](https://help.opera.com/en/extensions/acceptance-criteria/).

## 0. Before either store

1. Build the package: `node tools/pack.mjs` (in `extension/`) → `dist/kaak-extension-0.1.0.zip`.
2. Run the checks once more: `node --test core/test/` and `node test/e2e/run.mjs` (all must pass).
3. **The privacy policy is online** (decided 2026-10-27: keep `kaak` private, publish the policy from a
   separate public repo): https://ahmedfahim13.github.io/kaak-privacy/ is served by GitHub Pages from
   `AhmedFahim13/kaak-privacy` (`index.html` = a copy of `store/privacy-policy.html`). **When the policy
   changes, update both**: edit `store/privacy-policy.html`, copy it over `index.html` in that repo, push.
4. Use that URL wherever a form asks for a privacy policy (it's already in `listing.md`).

## 1. Microsoft Edge Add-ons (free, no fee)

**Account (once).**
1. Go to https://partner.microsoft.com/dashboard/microsoftedge/public/login and sign in with a Microsoft
   account (Outlook/Hotmail), or with GitHub (a Microsoft account is made for you). Work/school accounts
   are not accepted.
2. The **Microsoft Edge Developer Account Registration** form opens (if not: Account settings → Programs →
   Microsoft Edge → Get started).
3. Country: **Bangladesh**. Account type: **Individual** (this can't be changed later; Company needs
   business documents and takes weeks).
4. Publisher display name: **Fahim Ahmed** (max 50 characters; must be available).
5. Contact info: your name and email. Accept the App Developer Agreement → **Finish**. Wait for the
   confirmation email (individual accounts are quick).

**Submission.**
1. Partner Center → Edge → **Create new extension** → drag in `dist/kaak-extension-0.1.0.zip`. If it
   reports an error, send it to me.
2. **Availability:** Visibility **Public**. Markets: all (default) → **Save & Continue**.
3. **Properties:** Category **Productivity**. Website: `https://ahmedfahim13.github.io/kaak-privacy/`
   (Kaak has no other public page yet). Support contact: `theoslab.dev@gmail.com`. Mature content: unchecked. → **Save & Continue**.
4. **Privacy:** paste from `listing.md` → "Edge Privacy page":
   - Single purpose description.
   - One justification per permission (the form lists exactly the permissions in the manifest).
   - Remote code: **No, I am not using remote code**.
   - Data usage: Kaak collects nothing (no data leaves the computer), so the honest answer is to tick none
     of the "collect" boxes and tick every certification box. *This is your declaration to make.*
   - Privacy policy URL: `https://ahmedfahim13.github.io/kaak-privacy/` → **Save & Continue**.
5. **Store listings → English → Edit details:**
   - Description: paste from `listing.md` (it's well over the 250-character minimum).
   - Extension logo: `images/logo-300.png`.
   - Small promotional tile: `images/tile-small-440x280.png`.
   - Large promotional tile: `images/tile-large-1400x560.png`.
   - Screenshots (max 6, 1280×800): `images/1-arrive.png` … `images/6-escape.png`, in that order.
   - Search terms: from `listing.md` (7 terms).
   - **Save draft**.
6. **Publish** (top right) → paste the **Notes for certification** from `listing.md` → **Publish**.
   Review takes up to 7 business days. When it passes, the status becomes **In the Store** and the
   listing link is on the extension's Overview page.

## 2. Opera add-ons (free)

1. Sign in or create an account at https://addons.opera.com/ (top right), then open
   https://addons.opera.com/developer/upload/.
2. Upload `dist/kaak-extension-0.1.0.zip`. Opera reviewers read the code, so it must stay unminified
   (it is).
3. Fill in the pages of the form:
   - **Summary:** the one sentence under "Opera summary" in `listing.md`.
   - **Description:** the same description as Edge.
   - **Category:** Productivity.
   - **License:** your call (leaving it empty means CC BY-NC-ND 4.0).
   - **Support page:** `https://ahmedfahim13.github.io/kaak-privacy/` (it has the contact email).
4. After the upload, open the version's **Media** tab and add `images/opera/1-arrive.png` …
   `images/opera/6-escape.png` (612×408, Opera's preferred size), and the icon if asked
   (`../assets/icons/kaak-128.png`).
5. Review the last page and submit. Track it at https://addons.opera.com/developer/.

Opera's rules that Kaak already meets: no "Opera" in the name, no external JavaScript, no unneeded
permissions, and background actions described (the description says Kaak redirects feed sites while he
naps or holds a stolen feed).

## 3. Chrome, Brave and Vivaldi (no store, by choice)

These three only install from the Chrome Web Store, whose one-time $5 fee you decided not to pay
(2026-10-26). Their users load Kaak by hand, which works fine but has two costs: no automatic updates,
and the browser shows a "developer mode extensions" notice (Brave shows it on every start). Send testers
this:

> 1. Download `kaak-extension-0.1.0.zip` and unzip it into a folder you'll keep (deleting the folder
>    removes Kaak).
> 2. Open `chrome://extensions` (Brave: `brave://extensions`, Vivaldi: `vivaldi://extensions`).
> 3. Turn on **Developer mode** (top right), click **Load unpacked**, and pick the unzipped folder.
> 4. Click the puzzle icon in the toolbar and pin Kaak.
> 5. To update later: replace the folder's contents with the new version, then click the reload arrow
>    on Kaak's card.

The `kaak` repo stays private (a tester's email is in its old commits), so send testers the zip directly,
or publish it as a release on a separate public repo such as `kaak-privacy`. Paying the $5 later moves all three browsers to normal installs with updates;
the same zip works there, nothing in the code changes.

## 4. After it's live

- Put the store links in `extension/README.md` (Install section).
- Each new version: bump `version` in `manifest.json`, `node tools/pack.mjs`, then in Partner Center
  open the extension → **Packages** → upload the new zip → **Publish** (and the same on Opera).
- If you change what Kaak does with data, update `privacy-policy.html` *before* submitting.
