# Contributing to Shardus Core

Thank you for considering a contribution!

## Getting Started

Install dependencies using `npm install`. This command also sets up the git hooks required for development.

## Commit Workflow

Before each commit the `pre-commit` hook runs `npm run lint` and `npm run format-check`. These checks ensure that the code style and lint rules are satisfied.

You can run them manually at any time with:

```sh
npm run lint
npm run format-check
```

Please also make sure the unit tests pass with `npm test` before submitting a pull request.
