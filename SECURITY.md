# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub Security Advisories for this repository. Do not open a public issue containing exploit details, private DMARC data, credentials, tokens, or deployment identifiers.

Include:

- the affected version or commit;
- reproduction steps using synthetic data;
- expected and observed behavior;
- the potential impact;
- any suggested mitigation.

## Security boundaries

RUA Lens is designed for a single trusted organization behind Cloudflare Access. Every authenticated user can view imported normalized DMARC data. Administrators can additionally delete reports.

Original XML, gzip, and ZIP uploads are processed transiently and are not persisted. Normalized data includes source IP addresses, sender domains, authentication results, report metadata, and the importing user's email address. It remains in D1 until an administrator deletes it.

Self-hosters are responsible for Cloudflare Access policy, administrator configuration, D1 backups, retention decisions, Worker log access, and timely dependency updates.
