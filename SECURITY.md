# Security Policy

Debate Lab handles OAuth sessions, API keys, uploaded files, and repository content. This document explains the current security posture, supported versions, and how to report issues responsibly.

## Supported Versions

The `main` branch is the supported release line. Security fixes, dependency updates, and behavioral changes are expected to land there first.

Because the project depends on multiple external model providers and third-party services, some security properties are also governed by those providers' own policies and quotas.

## Reporting a Vulnerability

Do not report security vulnerabilities through public GitHub issues.

If you believe you have found a vulnerability, use one of the following channels instead:

- a private GitHub security advisory
- direct contact with the repository owner

Include as much detail as possible:

- affected route or file
- reproduction steps
- expected behavior
- actual behavior
- whether the issue exposes user data, secrets, or uploaded content

## Sensitive Data Handling

Debate Lab may store or process:

- OAuth session cookies
- Supabase credentials
- model provider API keys
- uploaded project files
- cloned repository content
- generated debate artifacts

Users should follow these rules:

- never commit `.env` files or secret values to version control
- use strong, unique secrets for `SESSION_SECRET`
- rotate provider keys if they are accidentally exposed
- review uploaded or cloned content before sharing artifacts externally

## Browser Storage

Some optional user preferences and provider keys are stored locally in the browser for convenience. This means:

- the values are only as secure as the local browser profile
- shared machines should avoid session-persistent secrets
- session-only storage is safer than long-lived storage for temporary use
- the app now defaults to session-only API-key storage
- signing out clears saved API keys from the browser
- session cookies are signed, HttpOnly, and can be marked Secure behind HTTPS with `SESSION_COOKIE_SECURE=true`
- the browser app sends a Content Security Policy to reduce injection risk from untrusted content

## Application Guardrails

The application includes several built-in protections:

- file and folder names are sanitized before writes and deletes
- repository cloning is restricted to GitHub URLs
- per-user input folders isolate content by authenticated user
- job polling strips internal lock objects before JSON serialization
- environment variables are validated at startup
- account deletion removes stored debates, profiles, and user input folders
- signing out clears the current workspace uploads and cloned repository content from disk
- repo cloning skips symlinks so cloned content cannot escape into other paths
- auth, chat, and clone endpoints are rate-limited server-side
- report and chat markdown is escaped before rendering, which blocks HTML injection through user content
- GitHub OAuth uses a signed state cookie and a locked-down callback flow

These protections reduce common mistakes, but they are not a substitute for correct deployment hygiene.

## Dependency Hygiene

Keep Python dependencies up to date and review changes before upgrading major packages. The project uses `requirements.txt` as the source of truth.

Recommended maintenance:

- update dependencies regularly
- review release notes for auth, networking, and crypto libraries
- rerun the smoke tests after upgrades
- check that provider SDKs still match the code paths in `agents.py` and `web_app.py`

## Deployment Guidance

When deploying the web app:

- keep secrets in environment variables or a managed secret store
- do not expose the Supabase service key to the browser
- use HTTPS for any public deployment
- restrict GitHub OAuth callback URLs to the exact deployment host
- monitor server logs for authentication or provider failures

## Input Safety

Debate Lab is designed to analyze user-supplied content. Treat uploaded files and cloned repositories as untrusted input.

Guidance:

- review external content before sharing reports
- avoid running the app against sensitive internal data unless the deployment is controlled
- assume cloned repositories may contain misleading or malicious content
- keep file path handling restricted to the authenticated user's folder

## Responsible Disclosure Timeline

We prefer a private disclosure channel and an opportunity to investigate before public release. If you include a proof of concept, keep it minimal and avoid unnecessary data exposure.
