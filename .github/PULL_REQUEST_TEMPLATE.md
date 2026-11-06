## What this changes

<!-- One paragraph: what the diff does. -->

## Why

<!-- The problem it solves for someone using the servers. Link the issue. -->

Closes #

## How to check it

<!--
Commands a reviewer can paste, and what they should see. For example:
- `npx jest -t 'xray_getTestRun' --workspace=packages/jira`
- Start the server with `TOOLSETS=default,xray_test_runs` and call xray_getTestRun with { "id": 7 }.
-->

## Checklist

- [ ] `npm run build` and `npm test` pass.
- [ ] Tests cover the change. A bug fix includes a test that would have caught the bug.
- [ ] [`CHANGELOG.md`](../CHANGELOG.md) has an entry under **Unreleased** for anything a user would notice.
- [ ] Code follows [CLAUDE.md](../CLAUDE.md): functions up to 35 lines, classes up to 300, errors through `handleApiOperation`.

For a new or changed tool:

- [ ] It has a catalog entry with a toolset and the right access level: `read`, `write` or `destructive`.
- [ ] A tool that changes data names the permission it needs in `anyOfPermissions`, or the catalog test explains why not.
- [ ] Its description says what it does and which tool to call first, if any.
- [ ] The server's README lists it in its toolset table.

For a Jira app:

- [ ] [`docs/supported-apps.md`](../docs/supported-apps.md) records the app version the tools were built from and how they were checked.

## Notes for the reviewer

<!-- Trade-offs you weighed, things you left out, follow-ups. -->
