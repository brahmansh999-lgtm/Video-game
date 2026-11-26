# CLAUDE.md

## Coding guidelines (Karpathy)

Bias toward caution over speed; use judgment on trivial tasks.

1. **Think before coding** — State assumptions explicitly. If multiple interpretations exist, present them rather than picking silently. If a simpler approach exists, say so and push back when warranted. If something is unclear, stop, name the confusion, and ask.
2. **Simplicity first** — Minimum code that solves the problem. No features beyond what was asked, no single-use abstractions, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite it.
3. **Surgical changes** — Touch only what the request needs. Don't refactor, reformat or "improve" adjacent code; match existing style. Mention unrelated dead code rather than deleting it. Remove only the imports/variables/functions your own changes orphaned. Every changed line should trace to the request.
4. **Goal-driven execution** — Turn tasks into verifiable goals (e.g. "fix the bug" → write a failing test that reproduces it, then make it pass). For multi-step work, state a brief plan with a verification check per step, and loop until verified.
