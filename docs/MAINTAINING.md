# Maintaining this repo — reviewing pull requests safely

You don't need to be a security expert to run this project safely. You just need a routine. This
guide is written for someone new to maintaining a public repo. **When in doubt, don't merge — it's
your repo and "no" is always a safe answer.**

## The one rule

**Never merge code you haven't read and don't understand.** A pull request is a stranger asking to
put their code into something people install. Read every line of the diff first.

## The 60-second routine for every PR

1. **Is CI green?** Every PR runs the tests automatically (the ✅/❌ at the bottom of the PR). If it's
   ❌, ask the contributor to fix it before you look further.
2. **Open the "Files changed" tab and read the whole diff.** Small, focused PRs are good. A huge or
   sprawling PR "doing a bunch of things" is a yellow flag — ask them to split it.
3. **Scan for the red flags below.** If you see one, slow down or decline.
4. **For anything non-trivial, run it locally first** (see "Test a PR safely").
5. Merge only when you understand what it does. Use **Squash and merge**.

## 🚩 Red flags — stop and scrutinize (usually: decline or ask hard questions)

A normal contribution to this project touches `src/` JS/HTML/CSS and maybe docs. Be very suspicious if
a PR does any of these:

- **Adds a permission.** Any change to `manifest.json` under `permissions` or `host_permissions`.
  This project's permissions are already broad; a PR should almost never need a new one. Default to **no**.
- **Adds a network call.** Search the diff for `fetch`, `XMLHttpRequest`, `WebSocket`,
  `sendBeacon`, or any `http://` / `https://` / `ws://` URL. **This extension sends nothing to any
  server.** A PR that adds outbound network is the single biggest red flag — reject unless there's an
  extremely good, clearly-explained reason.
- **Runs dynamic code.** `eval(`, `new Function(`, `setTimeout("...string...")`, dynamic `import()` of
  a URL, or injecting a `<script src="http...">`. Reject.
- **Adds dependencies or a build step.** Any new entry under `dependencies`/`devDependencies` in
  `package.json`, a new `package-lock.json`/`yarn.lock`, a `node_modules/` folder, or a bundler/CI
  step that downloads code. This project is intentionally **zero-dependency, no-build** — a new dep is
  a new supply-chain risk. Default to **no**.
- **Obfuscation.** Minified code, very long base64 strings, unfamiliar binary files, or code that's
  hard to read. Legit contributors write readable code. Reject obfuscated changes.
- **Touches data flow.** Changes to `downloads.js` (filenames), the clipboard text, or anything that
  reads page content and sends it somewhere. Read these extra carefully.
- **Telemetry / "phone home" / update checks** that contact a URL. Reject.
- **Unescaped page data into HTML.** New `innerHTML` with page-derived values that aren't passed
  through `esc()`/`escapeHtml()` (see `AGENTS.md`). Ask them to escape it.

## Test a PR safely (recommended for anything beyond a typo)

Run it in a **separate Chrome profile** so it can't touch your normal browsing:

```bash
gh pr checkout 123            # 123 = the PR number; pulls their branch locally
npm test && npm run verify    # must pass
# Create a fresh Chrome profile (chrome://profiles → Add), then in it:
#   chrome://extensions → Developer mode → Load unpacked → this folder
# Try the change. Watch the service-worker console for anything weird.
git checkout main             # done — go back to your copy
```

If anything tries to reach the network, asks for new permissions you didn't expect, or behaves oddly,
**do not merge**.

## Safe-merge checklist (copy this into the PR if it helps)

- [ ] CI is green
- [ ] I read the entire diff and understand it
- [ ] No new permissions, no network calls, no `eval`/dynamic code, no new dependencies
- [ ] If it changes the UI or behavior, I ran it locally and it works
- [ ] The change is focused and the code is readable

## Handling spam, abuse, or pushy contributors

- You're never obligated to merge anything. Closing a PR with a polite note is fine.
- You can **block a user**, **report** abuse, and **limit interactions** (Settings → Moderation) if you
  get drive-by spam after an HN spike.
- Turn on **"Require a pull request before merging"** and **"Require status checks to pass"** on `main`
  (Settings → Branches → Add rule) so nothing lands without CI + review.

## Never commit secrets

Don't put API tokens, passwords, or `.env` files in the repo. This project needs none, and CI needs no
secrets. If you ever paste one by accident, treat it as compromised and rotate it.

## Cheat sheet

```bash
gh pr list                 # see open PRs
gh pr view 123             # details
gh pr diff 123             # read the diff in the terminal
gh pr checkout 123         # try it locally (in a separate Chrome profile!)
gh pr review 123 --request-changes -b "Could you explain X?"
gh pr merge 123 --squash   # merge once you're confident
```
