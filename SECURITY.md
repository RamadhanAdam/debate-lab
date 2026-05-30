# Security Policy

## Supported Versions

Debate Lab relies heavily on external API providers. Ensure you are running the `main` branch to receive the latest security patches and dependency updates.

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

If you believe you have found a security vulnerability in Debate Lab, please responsibly disclose it by emailing the repository owner directly or opening a private security advisory through GitHub.

### Best Practices for Users
- **API Keys**: Never commit your `.env` file. Keys entered in the web UI are stored in your browser's local/session storage and are only transmitted securely to the backend when a debate runs.
- **Dependencies**: Keep your `requirements.txt` dependencies up to date. Dependabot is enabled on this repository to assist with this.