# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous minor release | Best effort |
| Older versions | No |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report vulnerabilities to: **security@modastera.com**

Include in your report:

- A clear description of the issue
- Steps to reproduce
- Affected platform (Android / iOS) and app version
- Proof of concept or exploit code, if available
- Your assessment of severity and impact

## Disclosure Process

1. We acknowledge your report within **72 hours**.
2. We triage and send a status update within **7 days**.
3. We work on a fix privately and coordinate a release.
4. We publicly disclose the details after the fix is available, or within **90 days** of the initial report — whichever comes first.
5. We credit reporters in the release notes unless they prefer to remain anonymous.

If you believe a vulnerability is being handled too slowly or inadequately, please say so in your follow-up. We take that feedback seriously.

## Scope

### In scope

- Any path that sends data off-device without explicit user action
- Permission bypasses or unexpected permission grants
- Data exposure across apps or users on the same device
- Integrity issues in the export or delete-all-data flows
- Vulnerabilities that allow one app to read another app's Zentra data

### Out of scope

- Security issues in third-party dependencies — please report these upstream
- Issues requiring physical access to an unlocked, rooted, or jailbroken device
- Theoretical vulnerabilities without a proof of concept or clear attack path
- Issues on unofficial forks or modified builds

## CVEs

For confirmed vulnerabilities with broad impact, we will request a CVE via a recognized
numbering authority and reference it in the release notes and security advisory.
