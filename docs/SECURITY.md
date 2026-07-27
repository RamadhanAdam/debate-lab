# Security Notes

This page summarizes the most relevant security choices in Debate Lab.

## Secret handling

- Provider keys are treated as browser-side session data by default.
- Session-only storage is preferred so keys are not left sitting in persistent browser storage.
- Sign-out clears saved keys from the browser.
- Auth and chat routes are rate-limited server-side to reduce abuse.
- Markdown is escaped before it is rendered in the chat and report views, which blocks HTML injection through user content.
- The browser app sends a Content Security Policy and keeps OAuth/session cookies HttpOnly, with secure-cookie support behind HTTPS.

## Backend trust model

- The backend keeps Supabase service credentials server-side only.
- The GitHub OAuth callback verifies the state token before exchanging the code.
- The GitHub OAuth callback is protected with a signed state cookie and path-scoped session cookies.
- File and folder paths are sanitized before anything is written to the workspace.
- Repository cloning is restricted to GitHub URLs.
- Clone requests skip symlinks and stay within the authenticated user workspace.

## Workspace safety

- Each user has a private input tree.
- Deletes are constrained to that user tree.
- Saved conversations are stored under the same user tree, not in a shared global folder.

## Operational advice

- Use HTTPS in production.
- Keep OAuth and Supabase secrets in an environment manager, not in source control.
- Prefer short-lived browser sessions for sensitive work.
- Audit provider quota and rate limits before exposing the app to many users.

## Where to continue

If you want the full disclosure and reporting process, read the root SECURITY.md file in the repository. That is the authoritative policy document.
