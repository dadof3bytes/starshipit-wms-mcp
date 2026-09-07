# Evaluations

The 10 questions in `evaluation.xml` are independent, read-only, and require multiple WMS tool calls.

Answers are `FILL_AFTER_CONNECTING` until a live WMS account is available. Maintainer workflow:

1. Run each question against the account with write tools disabled (`STARSHIPIT_WMS_READ_ONLY=true`).
2. Replace each answer with a single stable value (a record ID or a count taken at a documented moment).
3. Avoid answers that are on-hand quantities — those change.

The `.agents/` directory (gitignored) contains dev-only mcp-builder scripts for running evaluations locally. It is not required to deploy or use this server.

Prefer IDs and counts of filtered lists over stock figures.
