# Project guidelines

- Prefer simple, clear, consistent, accountable code over code that looks sophisticated.
- Prefer the smallest change that solves the issue.
- Match existing naming, architecture, and error handling.
- Do not invent APIs or dependencies that are not already in the repository.
- Comment only for non-obvious rationale, edge cases, or security notes.
- Treat user, API, database, file, network, and external-service input as potentially untrusted.
- Check validation, authorization, authentication, injection, access control, sensitive data exposure, error handling, and boundary conditions when relevant.
- Do not introduce new vulnerabilities while fixing old ones. Report related findings to the owner.
- Do not deliberately add mistakes or patterns to look human-written.
- Do not fake authorship. If a program explicitly requires AI disclosure, disclose it.
- Do not use the em dash character in code, comments, or documentation.
