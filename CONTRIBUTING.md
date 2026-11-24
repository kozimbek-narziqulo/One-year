# Contributing

Thank you for considering a contribution to One-year.

The project is maintained by an individual developer and is still evolving. Thoughtful bug reports, usability feedback, documentation improvements, and focused code contributions are welcome.

## Before making a change

1. Check the existing issues to see whether the problem or idea has already been discussed.
2. Use the repository's issue templates when reporting a bug or proposing a feature.
3. For a substantial change, open an issue first so the scope can be discussed.
4. Keep pull requests focused on one improvement.

## Pull requests

Please include:

- A clear description of the problem and the proposed change.
- Steps to reproduce a bug or verify a feature.
- Tests for behavior that can be tested automatically.
- Screenshots or a short recording for visible UI changes, when useful. Use synthetic example data only.

Before submitting, run the relevant checks:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

## Privacy and security

Never include real diary entries, personal photos, passwords, API secrets, Supabase service-role keys, production environment files, or private account information in issues, pull requests, tests, or screenshots. Use synthetic test data.

By submitting a contribution, you agree that it may be distributed under the MIT License that applies to this repository.
