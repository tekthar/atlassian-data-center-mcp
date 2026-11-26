# Supported apps

Marketplace apps add their own REST APIs. The Jira server, `mcp-jira-dc`, and the Confluence server,
`mcp-confluence-dc`, have tools for the apps below. The Bitbucket server doesn't support any apps yet.

| App | Server | Versions | Status |
|---|---|---|---|
| [Xray](#xray), test management | Jira | 8 | Beta |
| [ScriptRunner](#scriptrunner), scripting and automation | Jira | 9 and 10 | Beta |
| [Jira Service Management](#jira-service-management) | Jira | 11.3 | Functional |
| [draw.io](#drawio-for-confluence), diagrams | Confluence | 16 | Beta, read-only |
| [draw.io](#drawio-for-jira), diagrams | Jira | 11 | Beta, read-only |
| [Gliffy](#gliffy), diagrams | Confluence | 13 | Beta, read-only |
| [Zephyr](#zephyr), test management | Jira | 12 | Beta |
| [BigPicture](#bigpicture), portfolio and project management | Jira | 8 | Beta |
| [Tempo Timesheets](#tempo-timesheets), time tracking | Jira | 20 | Beta |
| [JMWE](#jmwe), workflow extensions | Jira | 10 | Beta |
| [Structure](#structure), hierarchies and portfolio planning | Jira | 9 | Beta |
| [Timesheet Tracking](#timesheet-tracking), planned work and timers | Jira | 9 | Beta, read-only |
| [Zephyr Essential](#zephyr-essential), test management (formerly Zephyr Squad) | Jira | 11 | Beta |
| [Tempo Capacity Planner](#tempo-capacity-planner), resource planning | Jira | 20 | Beta, read-only |

- **Functional** means the tools were run against a live instance of that app version and worked, as the app's section records.
- **Beta** means the tools were built and checked as described below, but not yet run against a live instance. Please
  [open an issue](https://github.com/tekthar/atlassian-data-center-mcp/issues) if something doesn't work with your
  version, and say which version you have.

This page records exactly which version each app's tools were built from and how they were checked, so you can compare
with the version on your instance. Your Jira administrator can see app versions under **Administration** > **Manage
apps**.

## Xray

Test management by Xpand IT, Marketplace key `com.xpandit.plugins.xray`. Added in 0.47.0.

| | |
|---|---|
| Built from | Xray **8.6.0-j11** for Data Center (Marketplace build 2008006002) |
| Checked against | Xray **8.6.1-j11** (Marketplace build 2008006013, released 2026-11-09), on 2026-11-15: the routes the tools call are unchanged. See [Checking newer builds](#checking-newer-builds) |
| Jira | Xray's Marketplace page lists the Jira versions each Xray release supports. This build's REST resources use Jakarta REST (`jakarta.ws.rs`) |
| REST APIs used | `/rest/raven/1.0` for tests, test executions, test plans and test sets; `/rest/raven/2.0` for test runs and test steps |
| Tools | 15, in the toolsets `xray_tests`, `xray_test_executions`, `xray_test_plans`, `xray_test_sets` and `xray_test_runs` |
| Detection | `GET /rest/raven/1.0/api/settings/teststatuses` at startup, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live Xray instance |

**How the tools were built.** We had no OpenAPI description of Xray's Data Center API, so every path, query parameter
and request body comes from the 8.6.0 app itself. Its `atlassian-plugin.xml` gave the two REST modules,
`javap` on its JAX-RS resource classes gave all 188 routes, and `javap` on its request classes gave the JSON bodies,
such as `{ "add": [...], "remove": [...] }` for adding tests and the test run update fields.

**How they were checked.**

- Unit tests check the exact URL, path, query and body each tool sends, and the input checks that stop a call before
  it is sent.
- Detection is tested for an installed app, a 404, another error, a timeout, and the `JIRA_APPS` settings.
- The bundled server was driven against a test HTTP server answering Xray's routes: detection found it, the tool
  search found the test run tools, and a `jira_runCode` script combined three Xray calls.

**Other 8.x versions** are expected to work: these tools use Xray's public v1 and v2 REST APIs, not its internal
ones. Only 8.6.0 was read, though, so earlier versions may lack an endpoint, and responses may differ in detail.

**Review (2026-11-16).** Each tool's request was checked again against the 8.6.1 routes, and the code behind the
add routes was read with `javap -c`:

- **Fixed:** the tools that add tests or test executions reported every key as added. Xray answers 200 even when it
  leaves keys out, such as ones that aren't tests or that it can't find, with a message about each in a list. The tools
  now return `requested`, `allAdded`, and `notAdded` with Xray's messages.
- **Added:** `xray_getTests` takes `filterId`, a saved Jira filter, which Xray's `/api/test` reads as `filter`.
- **Documented:** `/api/test` returns every matching test at once, with no paging and no cap, so the tool's
  description asks for a narrow selection. Adding a test set's key to a test execution adds the set's tests.

**Not covered yet.** Removing tests from executions, plans and sets (removing a test from an execution deletes its
results), test repository folders, preconditions, datasets, and importing automated test results. Two query options
aren't offered: `testDefinition` on a test set's tests, and `includeTestFields` on the test run search.

**To mark it Functional**, we need the tools run against a live Xray 8 instance, including detection with an ordinary
user's token, since it hasn't been confirmed that every user can read the test statuses detection asks for.

## ScriptRunner

Scripting and automation by Adaptavist, Marketplace key `com.onresolve.jira.groovy.groovyrunner`. Added in
0.48.0.

| | |
|---|---|
| Built from | ScriptRunner for Jira **9.46.0** for Data Center (Marketplace build 1011110, released 2026-10-20) |
| Checked against | ScriptRunner for Jira **10.20.0** (Marketplace build 1011210, released 2026-11-11), on 2026-11-15: the same routes, parameters and permission filters. See [Checking newer builds](#checking-newer-builds) |
| Jira | 10.0 to 10.7 with ScriptRunner 9.46, whose REST resources use `javax.ws.rs`, and 11.0 to 11.3 with ScriptRunner 10.20, which moved them to `jakarta.ws.rs`; as the two builds' Marketplace listings give |
| REST APIs used | `/rest/scriptrunner/latest` for the script editor, built-in scripts, the script console, scheduled jobs, REST endpoints and fragments; `/rest/scriptrunner-jira/latest` for listeners, scripted fields, workflow functions and JQL functions; `/rest/scriptrunner/behaviours/latest` for behaviours |
| Tools | 12 that read, in the toolsets `scriptrunner_script_editor`, `scriptrunner_builtin_scripts`, `scriptrunner_features` and `scriptrunner_behaviours`; 9 opt-in tools that run, validate, preview or save code or change behaviours, in `scriptrunner_console`, `scriptrunner_builtin_scripts`, `scriptrunner_script_editor` and `scriptrunner_behaviours` |
| Detection | `GET /rest/scriptrunner-jira/latest/jqlfunctions/docs` at startup, which any signed-in user may read, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live ScriptRunner instance |

**How the tools were built.** ScriptRunner publishes no OpenAPI description of these routes, so every path, query
parameter and body comes from the 9.46.0 app itself. Its `atlassian-plugin.xml` gave the REST modules, and `javap` on
their resource classes gave 69 routes under `/scriptrunner`, 43 under `/scriptrunner-jira` and 26 under
`/scriptrunner/behaviours`.

Scripted fields, scheduled jobs, REST endpoints and fragments declare only their base path. Their routes come from
ScriptRunner's shared base endpoints, which answer `GET <path>` with every configured item and `GET <path>/{id}` with
one. `javap` on those base classes gave the inherited routes.

`javap -c` on the endpoints gave the response shapes the tools rely on:

- the script editor sends a file's content as base64, which `scriptrunner_getScriptFile` decodes;
- it lists each script root's files as a map from path to file details;
- a built-in script is described by its `className`, `name`, `description`, `tags` and `helpUrl`;
- the parameters route calls ScriptRunner's own parameter builder, which returns the form and runs nothing;
- the script console takes `{ "script": ... }` or `{ "scriptPath": ... }`. It answers `{ output, snapshot }`, whose
  snapshot holds the run's log and time. A failed script answers 500 with the exception, its stack trace and the
  snapshot;
- a built-in script runs with its parameter values as a JSON object, the same keys the parameters route returns;
- the script editor saves a file from its base64-encoded content, sent as `application/octet-stream`. `POST` refuses
  to replace an existing file and `PUT` replaces it;
- a behaviour is saved whole, by `POST /admin/behaviour`, as the same object `GET /admin/behaviour/{id}` returns.
  That object has its `id`, `name`, `description`, `disabled`, `guideWorkflow`, the initialiser `init`, and
  `fields`, each with its rules and scripts. Without an `id`, the post creates a behaviour;
- a mapping is added with `{ behaviourId, type, projectIds, issueTypeIds }`, or `serviceDesk` and `requestTypes` for
  `SERVICEDESK`. It is removed by `DELETE /admin/mapping` with the behaviour `id`, `type`, and the mapping's `pid`
  and `issueTypeId`, or its `serviceDeskId` and `requestTypeId`.

**Who may use them.** ScriptRunner filters most of these routes itself: to Jira administrators, or to the users its own
permission settings allow. Only the JQL function docs are open to every signed-in user. Read tools are never hidden by
`PERMISSION_FILTER`, so a user ScriptRunner doesn't allow gets a 403, and the tool says who ScriptRunner lets in.

**Running and saving code, and changing behaviours.** `scriptrunner_runConsoleScript`,
`scriptrunner_runBuiltInScript` with `scriptrunner_validateBuiltInScript` and `scriptrunner_previewBuiltInScript`,
`scriptrunner_saveScriptFile` and the four behaviour tools
(`scriptrunner_saveBehaviour`, `scriptrunner_setBehaviourEnabled`, `scriptrunner_mapBehaviour` and
`scriptrunner_unmapBehaviour`) can change anything on the instance, or the screens of everyone who uses it. So each is
guarded in four ways:

- It is destructive.
- It is registered only when its own setting is `true`: `JIRA_SCRIPTRUNNER_CONSOLE_ENABLED`,
  `JIRA_SCRIPTRUNNER_BUILTIN_RUN_ENABLED` for running, validating and previewing a built-in script,
  `JIRA_SCRIPTRUNNER_FILE_SAVE_ENABLED`, or, for all four behaviour tools, `JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED`.
- It is listed only when `TOOLSETS` names its toolset.
- It is hidden from anyone `PERMISSION_FILTER` doesn't find to be a Jira administrator.

The tool search and `jira_runCode` never offer them. Saving creates a file unless you pass `overwrite: true`. A failed
console script returns its exception, the first 15 lines of the stack trace and its log, rather than the whole trace.

The behaviour tools also refuse three things before calling ScriptRunner:

- replacing a behaviour without its `fields`, because a behaviour saved without them loses its field rules;
- a mapping that names nothing to map to;
- removing a mapping without both of its ids, so one call never removes more than one mapping.

**How they were checked.**

- Unit tests check the exact URL, method, query and body each tool sends, the base64 decoding, the built-in script
  search, and the 403 and 404 messages.
- They also check that each tool that runs or saves code is registered only with its own setting. The catalog test
  checks that the tool search never offers them, even with `TOOLSETS=all`, and that `READ_ONLY_MODE` leaves them out.
- The bundled server was driven with `JIRA_SCRIPTRUNNER_CONSOLE_ENABLED`:
  - with the setting and `TOOLSETS` naming `scriptrunner_console`, `scriptrunner_runConsoleScript` was listed as
    destructive and ran one script;
  - with either one alone, it wasn't listed;
  - the tool search never offered it, `jira_runReadTool` and `jira_runWriteTool` didn't know it, and a `jira_runCode`
    script that called it was refused before anything reached ScriptRunner.
- The bundled server was driven with `JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED` and `scriptrunner_behaviours` in
  `TOOLSETS`. The four behaviour tools were listed as destructive, and switching a behaviour off sent one `POST` to its
  `disable` route. The tool search didn't offer them, and a `jira_runCode` script was refused. Without the setting,
  only `scriptrunner_getBehaviours` was listed.
- Detection is tested with both Xray and ScriptRunner installed, with only one of them, and with the `JIRA_APPS`
  settings.
- The bundled server was driven against a test HTTP server answering ScriptRunner's routes. Detection found
  ScriptRunner and quietly left out Xray, which answered 404. The tool search found all seven tools, and
  `jira_runReadTool` ran one of them. A `jira_runCode` script listed the script files and read one.
- Validating and previewing a built-in script are tested on their own routes, registered only with the run setting,
  and a failed validation's errors come back in the tool's details.
- With the feature tools added, the tool search ranked the right tool first for "scheduled jobs", "scripted field",
  "rest endpoint", "workflow post function" and "web panel fragment". A `jira_runCode` script read the scheduled jobs.

**Review (2026-11-16).** Every route the tools call was checked against 10.20.0: the paths, query parameters and
permission filters match, the console's JSON body is ScriptRunner's `ScriptConfiguration` (`script`, `scriptPath`),
and running a built-in script answers when it's done, with no background task to poll. No bug turned up. One gap was
filled: `scriptrunner_validateBuiltInScript` and `scriptrunner_previewBuiltInScript` call the `validate` and
`preview` routes that ScriptRunner's own page uses before a run, so an agent can check the values and see what a bulk
fix would change first. They run the built-in script's own code, and nothing in the build shows that code never
changes anything, so they come with running a built-in script: the same setting, destructive, and never offered by the
tool search or `jira_runCode`.

**Other 9.x and 10.x versions** are expected to work. 9.46.0 and 10.20.0 were read, so an earlier version may lack a
route.

**Left out on purpose:**

- **Deleting a behaviour.** Switching one off keeps it and its mappings, and can be undone.
- **ScriptRunner's resources.** These are database and other connections, and their settings can hold passwords.
- **Script search.** It lists the same files as the script editor.

The XML behaviours configuration (`/config`) isn't used: the JSON admin routes cover the same behaviours.

## draw.io for Confluence

Diagrams by Seibert (draw.io), Marketplace key `com.mxgraph.confluence.plugins.diagramly`. Added in 0.48.0.

| | |
|---|---|
| Built from | draw.io for Confluence **16.1.12** for Data Center (Marketplace build 16001001200) |
| Checked against | draw.io for Confluence **16.1.13** (Marketplace build 16001001300, released 2026-11-12), on 2026-11-15: the same 66 routes. See [Checking newer builds](#checking-newer-builds) |
| REST API used | `/rest/drawio/1.0`, and Confluence's own `/rest/api/content/{id}` for a page's storage format |
| Tools | 3, all read-only, in the toolset `drawio_diagrams` |
| Detection | `GET /rest/drawio/1.0/config` at startup, which the diagram editor reads for every user, unless `CONFLUENCE_APPS` names the apps to offer |
| Status | Beta: not yet run against a live draw.io instance |

**How the tools were built.**

- **Routes.** The Marketplace download is an OBR bundle. The plugin jar inside declares one REST module, `drawio`
  version 1.0, served with Atlassian's REST v2, so its resources are found by their annotations. `javap` on the
  Jakarta REST classes gave every route.
- **Responses.** `javap -c` gave the response shapes:
  - a diagram read (`GET /diagram/crud/{diagramName}/{owningPageId}`) returns the diagram's page, space, revisions,
    last change and its file as `xml`;
  - the search (`GET /diagramSearch`) returns the same objects without the file.
- **Macros.** The macro definitions in `atlassian-plugin.xml` gave the parameters of the `drawio`, `drawio-sketch`,
  `inc-drawio` and legacy `diagramly` macros. `drawio_listPageDiagrams` reads `diagramName`, `revision`, and, for an
  embedded diagram, `pageId`.

**Reading a diagram.** A draw.io file holds one model per page, either as XML or compressed: URI-encoded, deflated and
base64-encoded. `drawio_getDiagram` inflates compressed pages. By default it then summarizes each page as its shapes,
with their labels as plain text, their shape and their container, and its connections by the labels they join.
Labels attached to a connection are read too. A page lists at most 300 shapes and 300 connections and counts the rest.
`format: "xml"` returns each page's model instead.

Diagram files and page bodies are written by other people. So they are read with a one-pass tag scanner
(`xml-tags.ts` in the common package) rather than regular expressions, which take quadratic time on crafted input:
200,000 `<` characters took 35 seconds through the first version's label regex. A test feeds crafted files and pages to
both readers and checks they finish quickly. Attributes go into objects without a prototype, so an attribute named
`__proto__` stays data.

**How they were checked.**

- Unit tests check each tool's request, the page-macro scan with an embedded diagram, and the summary of a diagram
  with a container, a wrapped shape, a connection label and a loose connection. They also check a compressed page,
  made the way draw.io compresses it.
- Detection is tested for an installed app, a 404, another error, and the `CONFLUENCE_APPS` settings.
- The catalog test checks that the tools are reached through the tool search unless `TOOLSETS` names
  `drawio_diagrams`.
- The bundled Confluence server was driven against a test HTTP server answering draw.io's routes. Detection found
  draw.io, and no draw.io tool was listed directly. The tool search found all three. A `confluence_runCode` script
  listed a page's diagrams and read a compressed one: "API" connected to "Database" by "SQL".

**Creating and editing diagrams isn't offered.** draw.io's save routes require a PNG preview of the diagram along with
its XML. The preview is the image Confluence shows in PDF and Word exports, emails and some views, and the editor
renders it in the browser. Without one, the save fails: the preview writer throws "Not supported". This server can't
render a diagram to an image, so the [roadmap](#roadmap) lists the options.

Revision history is left out too: its route needs the diagram attachment's id and version, which the other routes don't
return together.

**Review (2026-11-17).** The requests were checked again against 16.1.13, and `javap -c` was run on the code behind
the diagram read:

- **Fixed: reading could write.** draw.io's editor reads diagrams through the same route. When it opens an earlier
  revision of a diagram whose last change is more than a week old, and the user may edit it, draw.io first saves the
  current diagram as a backup attachment on the page, with the comment "draw.io diagram backup". So
  `drawio_getDiagram` with `revision` could add an attachment to the page, as the reader. Its query
  parameter `noHistVerCheck` skips that backup and is used for nothing else, so the tool now always sends
  `noHistVerCheck=true`. A test checks it, and it fails without the fix.
- **Checked:** the search's `diagramTypes` takes `DRAWIO` or `GLIFFY`, and the tool asks for `DRAWIO`. The read
  route also takes a `Sec-Fetch-Site` header, which browsers send, to tell cross-site requests apart. Without the
  header, draw.io treats the request as one from its own pages, which is why the backup could happen.
- **Noted:** a diagram too large for draw.io's request budget answers 413, and the tool reports it as an error.

**The draw.io file format** is shared with [draw.io for Jira](#drawio-for-jira): the decoding and the summary are in
the common package (`drawio-file.ts`).

## draw.io for Jira

Diagrams by Seibert (draw.io), Marketplace key `com.mxgraph.jira.plugins.drawio`. Added in 0.48.0.

| | |
|---|---|
| Built from | draw.io for Jira **11.2.1** for Data Center (Marketplace build 1100200100) |
| REST API used | `/rest/drawio/1.0` |
| Tools | 2, both read-only, in the toolset `drawio_diagrams` |
| Detection | `GET /rest/drawio/1.0/library/list` at startup: every signed-in user has a list of shape libraries, often empty. `JIRA_APPS` can name the apps to offer instead |
| Status | Beta: not yet run against a live draw.io instance |

**How the tools were built.** Diagrams are attachments on issues. `javap` on the app's Jakarta REST resources gave its
routes:

- `GET /diagram/list/{issueKey}` lists an issue's diagrams, as the same diagram objects draw.io for Confluence uses,
  plus a `displayName`;
- `GET /diagram/crud/{diagramName}/{issueKey}` reads one, with its file as `xml`.

Both check that the user may browse the issue.

**Reading a diagram** works as in [draw.io for Confluence](#drawio-for-confluence). `drawio_getDiagram` returns each
page as shapes and connections by label, or as XML with `format: "xml"`. Compressed pages are inflated.

**How they were checked.** Unit tests check both tools' requests, the summary of a compressed diagram, the 404 message
and the issue key check. Detection is tested with all three Jira apps installed, with only some of them, and with
`JIRA_APPS`. The catalog test checks that the tools are reached through the tool search unless `TOOLSETS` names
`drawio_diagrams`.

The bundled Jira server was driven against a test HTTP server answering draw.io's routes. Detection found draw.io, and
neither tool was listed directly. The tool search found both, and a `jira_runCode` script listed an issue's diagrams
and read a compressed one: "Client" connected to "Gateway" by "HTTPS".

**Review (2026-11-17).** Both requests match 11.2.1's routes, and its diagram read has no editor side effect like the
Confluence app's backup: it only reads. No bug turned up.

**Not covered yet:** creating and editing diagrams. As in Confluence, a save needs a PNG preview ("A save reached the
image writer with no preview"); see the [roadmap](#roadmap). Revision history needs the attachment's id and version
too: `GET /diagram/revisions/{diagramName}/{issueKey}` and `GET /diagram/revision/{diagramName}/{issueKey}` answer 400
unless `containerId`, `attachmentId` and `expectedVersion` are all given.

## Zephyr

Test management by SmartBear, formerly Zephyr Scale and Test Management for Jira, Marketplace key
`com.kanoah.test-manager`. Added in 0.48.0.

| | |
|---|---|
| Built from | Zephyr **12.12.1-jira11** for Data Center (Marketplace build 800702964, released 2026-11-03) |
| Jira | 11.0 to 11.3, as this build's Marketplace listing gives. SmartBear publishes a separate build for each Jira line; the public API below is the same in all of them |
| REST API used | `/rest/atm/1.0`, Zephyr's public API |
| Tools | 15 in the toolsets `zephyr_test_cases`, `zephyr_test_cycles` and `zephyr_test_plans`: 10 that read, and 5 that record results or create a test case, cycle or plan |
| Detection | `GET /rest/atm/1.0/healthcheck` at startup, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live Zephyr instance |

**How the tools were built.** The app declares four REST modules. Only `atm` is public, the API SmartBear documents as
Zephyr Scale Server API v1; `tests` and `kanoahtests` serve Zephyr's own pages, and `tm4j/admin` serves its
administration. `javap` on the public API's Jakarta REST resources gave its 59 routes, which match SmartBear's
published v1 reference. Search routes default to 200 results, so the tools page with the server's page size instead.

**Names.** This API calls a test cycle a "test run", with keys such as `QA-R4`. The tools use the names Zephyr's pages
show, so `zephyr_getTestCycle` calls `GET /rest/atm/1.0/testrun/{testRunKey}`. Test cases have keys such as `QA-T12`,
and test plans keys such as `QA-P2`. Searches take TQL, Zephyr's query language, for example
`projectKey = "QA" AND folder = "/Regression"`.

**Writing.** `javap -p` on the request classes gave the bodies, which match SmartBear's reference:

- a result (`TestResultDTO`) carries `status`, `comment`, `environment`, `executionTime`, `executedBy`, `issueLinks`
  and per-step `scriptResults`;
- a test case (`TestCaseDTO`) carries `testScript`, whose `type` is `STEP_BY_STEP`, `PLAIN_TEXT` or `BDD`;
- a test cycle (`TestRunDTO`) lists its test cases as `items`;
- a test plan (`TestPlanDTO`) lists its cycles as `testRunKeys`.

The tools take friendlier names and map them:

| Tool | Request |
|---|---|
| `zephyr_recordTestResult` | `POST /testrun/{testRunKey}/testcase/{testCaseKey}/testresult` adds an execution. With `replaceLatest`, `PUT` on the same route updates the latest one. `stepResults` become `scriptResults` |
| `zephyr_recordTestResults` | `POST /testrun/{testRunKey}/testresults` with a list of results, each naming its `testCaseKey`, adds an execution for each, up to 200 in one call |
| `zephyr_createTestCase` | `POST /testcase`. `steps` become a `STEP_BY_STEP` script and `plainText` a `PLAIN_TEXT` one; the tool refuses both together |
| `zephyr_createTestCycle` | `POST /testrun`. `testCaseKeys` become `items` |
| `zephyr_createTestPlan` | `POST /testplan`. `testCycleKeys` become `testRunKeys` |

Fields left out aren't sent, so Zephyr's project defaults apply. Zephyr decides who may write, with its own project
permissions. Jira's permission list doesn't report those, so the writes are ungated, as Xray's test run update is.

**How they were checked.** Unit tests check each tool's URL, path and query, the paging defaults, the 404 message
and the key checks. They also check each write's method, path and body, and the date and key checks. Detection is tested with all four Jira apps installed, with only some of them, and with
`JIRA_APPS`. The catalog test checks that the tools are reached through the tool search unless `TOOLSETS` names
their toolset.

The bundled Jira server was driven against a test HTTP server answering Zephyr's routes. Detection accepted the
health check's empty answer, and no Zephyr tool was listed directly. The tool search ranked the right tool first for
"test cycle results", "test cases covering issue" and "test plan". One `jira_runCode` script found the test cases
covering `QA-12` and the latest result of each: three calls, one answer.

With the writes added, the tool search listed `zephyr_recordTestResult` as a write. `jira_runReadTool` refused it and
pointed to `jira_runWriteTool`, which created a test cycle and recorded a result with exactly the bodies above. A
`jira_runCode` script couldn't call it.

**Review (2026-11-17).** Every request was checked again against 12.12.1-jira11, still the newest build: the query
parameters of each read, and the fields of each body against `TestResultDTO`, `TestScriptResultDTO`, `TestScriptDTO`,
`StepDTO`, `TestCaseDTO`, `TestRunDTO` and `TestPlanDTO`. They all match, and no bug turned up. The result routes
also take `environment` and `userKey` as query parameters, but the body carries the same fields, so the tools send them
there. One gap was filled: `zephyr_recordTestResults` uses Zephyr's bulk route, so an automated run's results go in
one call instead of one per test case. Its unit tests check the body list and that an empty list, or a result without
its test case, is refused.

**Not covered yet:** updating test cases and plans, attachments, folders, custom fields, BDD scripts, importing
automation results, and deleting. Deleting is left out on purpose. A result's `executionDate`, actual start and end
dates, `assignedTo`, `version` and `iteration` aren't offered either.

## BigPicture

Portfolio and project management by Appfire (formerly SoftwarePlant), Marketplace key `eu.softwareplant.bigpicture`.
Added in 0.48.0.

| | |
|---|---|
| Built from | BigPicture **8.70.11.6** for Data Center (Marketplace build 40002006696, released 2026-10-28) |
| Jira | 11.0 to 11.3, as this build's Marketplace listing gives |
| REST API used | `/rest/softwareplant-bigpicture/1.0/public`, BigPicture's public API |
| Tools | 23: 18 read, 4 write and 1 destructive, in the toolsets `bigpicture_boxes`, `bigpicture_issues`, `bigpicture_teams` and `bigpicture_resources` |
| Detection | `GET /rest/softwareplant-bigpicture/1.0/public/ppm/box/box-types` at startup, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live BigPicture instance |

**How the tools were built.** The app declares two REST modules served with Atlassian's REST v2:
`softwareplant-bigpicture` and its alias `bigpicture`, both version 1.0. 372 classes carry REST resources, most of them
BigPicture's own pages. Only the classes in packages named `publicapi` serve the public API that Appfire documents, and
`javap` on those gave its 68 routes, all under `/public`. BigPicture marks them `UnrestrictedAccess`, which leaves the
permission checks to BigPicture itself, box by box. `javap -p` on the response classes gave the box fields: `boxId`,
`boxName`, `boxTypeId`, `boxStatus`, the dates, `boxLeader`, `boxArchived`, and in the hierarchy, `boxChildren`.

**Boxes and issues.** BigPicture's boxes are its portfolios, programs, projects and iterations. What it calls tasks
are Jira issues, which the API takes by key, so the tools say "issue": `bigpicture_getIssueBoxes` and
`bigpicture_getIssueFields`. That also lets the tool search match the word people use. `bigpicture_getBoxHierarchy`
leaves out archived boxes, and everything under them, unless `includeArchived` is set, so a long-lived instance's tree
stays readable.

**Writes.** `javap -p -c` on the request classes and the code that reads them showed what each write needs:

- `bigpicture_updateIssueField` sends `fieldName`, `dataTypeId` and `fieldValue`, which BigPicture parses with Gson as
  the JSON of the type's value object. The tool wraps a plain value for the five simple types: `{"value": ...}` for
  `STRING`, `DATE` and `BOOLEAN`, `{"number": ...}` for `NUMBER` and `PERCENTAGE`. Gson skips keys a type doesn't have,
  so a value of the wrong kind would arrive empty; the tool refuses it instead. Other types take the value object in
  the shape `bigpicture_getIssueFields` returns. Field names are BigPicture's display names, such as `Story Points`.
- `bigpicture_addBox` needs both dates, as `YYYY-MM-DD`, and an icon: BigPicture reads `boxIconId` without a null
  check and has no default for it in the public API. The tool sends BigPicture's own default box icon,
  `font-awesome-box-open@lightPurple`, unless one is given. New boxes start as not started.
- A team membership is a series of periods, each with a start date and an availability that lasts until the next.
  Adding a member takes a start date and an availability (BigPicture assumes 100% when it's left out) and ignores an
  end date, so the tool doesn't offer one. Changing one names the period by its start date. People are named by
  BigPicture's `individualId`, `EXT_USER@<platform>@<user key>`; the tools ask for it as `bigpicture_getTeamMembers`
  lists it, or as the `resourceKey` the holiday and workload plan tools list, rather than building it.
- `bigpicture_removeTeamMember` removes the person with every period of their membership, so it is destructive: the
  tool search never offers it, and it is listed only when `TOOLSETS` names `bigpicture_teams`.

Setting an issue's fields is offered only to people with Jira's Edit Issues permission. BigPicture checks box and team
permissions itself, so those writes aren't gated on a Jira permission.

**Resource planning.** BigPicture plans with resources: the people on its teams, named by the same `individualId`.
`javap -p` on the `resource/publicapi` classes gave what the read tools return:

- `bigpicture_getSkills` lists the skills, and `bigpicture_getPersonSkills` a person's skills with the dates each
  applies. `bigpicture_getPersonAbsences` gives a person's absences: dates, type, comment and
  `percentageUnavailability`.
- `bigpicture_getHolidayPlans` and `bigpicture_getWorkloadPlans` list the plans that set people's working days and
  hours, or get one by id. `bigpicture_getHolidayPlanPeople` and `bigpicture_getWorkloadPlanPeople` list who each plan
  applies to and from when, each person with their `resourceKey`, which is the `individualId` the other tools take.
- `bigpicture_getCapacity` asks BigPicture how much working time people have between two dates. It is a `POST`, but it
  only reads: it takes Jira user keys and returns each person's total in seconds, optionally day by day, and the keys
  BigPicture doesn't know. The tool adds each total in hours.

These read tools are in the `bigpicture_resources` toolset. BigPicture checks a person's resource access itself.

**How they were checked.** Unit tests check each tool's URL, path, query and body, the archived-box pruning, the
combined types and statuses read, and the 404 message. For the writes they also check how each field type's value is
sent, that values of the wrong kind and badly formatted dates, icons and availabilities are refused before any
request, the default icon, and that fields left out stay out of the body. For resource planning they check each path,
plan by id and all plans, the capacity body and the hours added, and that a capacity request with no people or a
badly written date is refused. Detection is tested with all five Jira apps installed, with only some of them, and
with `JIRA_APPS`. The catalog test checks that the tools are reached through the tool search unless
`TOOLSETS` names their toolset.

**Review (2026-11-18).** Every route the tools call was checked again against 8.70.11.6, still the newest build: the
paths, query parameters and bodies match, `/ppm/teams` reads `boxIds` as a set, which the repeated query keys fill,
and the hierarchy's `boxArchived` and `boxChildren` are the names the pruning uses. `javap -c` on every read route's
handler found no call that saves, creates, updates or deletes, unlike the draw.io for Confluence read. No bug turned
up. One gap was filled: the tools could say which boxes an issue is in, but not which issues a box plans.
`bigpicture_getBoxIssues` asks `POST /ppm/boxarea/task/scope` for the box's tasks, which it names by BigPicture task
id, then reads each page's Key and Summary, or the fields asked for, with `POST /ppm/task/core/task/field/bulk`. Both
handlers only query. Field values come back plain, such as `"PROJ-1"` or `5`, and richer ones as objects.

**Not covered yet:** changing resource planning (skills, absences, holiday and workload plans); box fields and box
scope definitions; duplicating and deleting boxes; creating and changing global teams; and updating many issues' fields
at once. Deleting boxes is left out on purpose.

## Tempo Timesheets

Time tracking by Tempo Software, Marketplace key `is.origo.jira.tempo-plugin`. Added in 0.48.0. It was the first app chosen from the Marketplace's most popular Data Center apps; see the
[roadmap](#roadmap) for why.

| | |
|---|---|
| Built from | Timesheets by Tempo **20.0.1** for Data Center (Marketplace build 1313322, released 2026-10-26) |
| Jira | 10.0 to 11.3, as this build's Marketplace listing gives |
| REST APIs used | `/rest/tempo-timesheets/4`, the Timesheets REST API that Tempo documents for Data Center; `/rest/tempo-accounts/1` and `/rest/tempo-teams/2` from its bundled Accounts and Teams apps |
| Tools | 19: 14 read, 4 write and 1 destructive, in the toolsets `tempo_worklogs`, `tempo_timesheets`, `tempo_accounts` and `tempo_teams` |
| Detection | `GET /rest/tempo-timesheets/4/period/current` at startup, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live Tempo instance |

**How the tools were built.** The Marketplace download is an OBR bundle: the Timesheets plugin jar, with Tempo's
accounts, teams, planning and platform jars beside it. The Timesheets jar declares REST modules for versions 1 to 5 under
`/tempo-timesheets`, each in a Jakarta and a `javax` copy. Version 4 is the one Tempo documents. `javap` on its Jakarta
resources gave 40 routes, and these tools use six of them:

| Tool | Request |
|---|---|
| `tempo_searchWorklogs` | `POST /worklogs/search`. The body's JSON names come from `@JsonProperty` on `SearchParamsBean`: `from`, `to`, `worker`, `taskKey`, `projectKey`, `epicKey`, `teamId`, `accountKey`, `filterId` and `includeSubtasks`, matching Tempo's documentation |
| `tempo_getWorklog` | `GET /worklogs/{worklogId}` |
| `tempo_getPeriods` | `GET /period/current`, or `GET /period?dateFrom&dateTo` for a range |
| `tempo_getTimesheetApproval` | `GET /timesheet-approval/current?userKey&periodStartDate` |
| `tempo_getTeamTimesheetApprovals` | `GET /timesheet-approval?teamId&periodStartDate` |
| `tempo_getPendingTimesheetApprovals` | `GET /timesheet-approval/pending?reviewerKey` |

A worklog comes back with `tempoWorklogId`, `issue`, `worker`, `started`, `timeSpentSeconds`, `billableSeconds`,
`comment` and `attributes`, from the getters of `TempoWorklogV4Bean`. A timesheet approval carries its `status`
(`open`, `ready_to_submit`, `waiting_for_approval` or `approved`), `workedSeconds`, `submittedSeconds`,
`requiredSeconds`, and the reviewer's last action.

**Searching worklogs.** The search handler calls `WorklogSearchService.findWorklogs` and returns every match, without
paging or a cap. So `tempo_searchWorklogs` requires both dates, adds up `hours` and `billableHours` over every match,
and lists only the first `limit` worklogs, marking the answer `truncated` when there are more.

**Reading only reads.** `javap -c` on the handler behind each of the six routes, and on the approval services they call,
found only lookups: `findWorklogs`, `findWorklogById`, `getPeriods`, `getCurrentPeriod`, `findCurrentForDateFrom` and
`getPendingApprovals`. None of the six routes has a resource filter; Tempo checks each user's access itself.

**Writing.** `javap -v -p` on the request classes gave the JSON names, and `javap -c` on the code that reads them gave
the formats:

| Tool | Request |
|---|---|
| `tempo_logTime` | `POST /worklogs` with `TimesheetWorklogBean`: `worker`, `originTaskId` (the issue key), `started`, `timeSpentSeconds`, `billableSeconds`, `remainingEstimate`, `comment`, `endDate` and `includeNonWorkingDays`. Tempo's validator refuses a worklog without a worker or a date, and can require a comment |
| `tempo_updateWorklog` | `PUT /worklogs/{worklogId}` with only the keys `WorklogChangesBean` reads: `started`, `timeSpentSeconds`, `billableSeconds`, `comment` and `remainingEstimate` |
| `tempo_deleteWorklog` | `DELETE /worklogs/{worklogId}` |
| `tempo_getSuggestedReviewers` | `GET /timesheet-approval/user/{userKey}/suggestedreviewers` |
| `tempo_submitTimesheet`, `tempo_reviewTimesheet` | `POST /timesheet-approval` with `ApprovalBean`: `user`, `period.dateFrom` and `action` (`name`, `comment`, `reviewer`). Tempo finds each user by `key` or `name`; the tools send `key`. The action names are Tempo's `Approval$Action`: `submit`, `approve`, `reject` and `reopen` |

The tools take hours and convert them to seconds. `started` is a day, or a day and start time, which the tool sends as
`yyyy-MM-dd` or `yyyy-MM-dd'T'HH:mm:ss.SSS`, two of the four formats Tempo's `UIDateParser` reads. Tempo needs the
worker's Jira user key, so when none is given the tools read the token owner's from `/rest/api/2/myself`.

Logging time needs Jira's Work On Issues permission, changing a worklog Edit Own or Edit All Worklogs, and deleting one
Delete Own or Delete All Worklogs; Tempo checks them too. Deleting is destructive, so the tool search never offers it.
Submitting and reviewing timesheets are decided by Tempo's own permissions, which Jira's permission list doesn't report,
so those two are ungated.

**How they were checked.** Unit tests check each tool's method, URL, path, query and body, the search's JSON names,
the totals and the truncation, the date checks, and the 404 message. For the writes they check the bodies under
Tempo's names, the conversion to seconds and Tempo's date format, the current-user lookup and when it is skipped, that
an update sends only what changes, and the approval bodies. Detection is tested with all six Jira apps
installed, with only some of them, and with `JIRA_APPS`. The catalog test checks that the tools are reached through the
tool search unless `TOOLSETS` names their toolset.

**Accounts and teams.** Tempo's Accounts (`com.tempoplugin.tempo-accounts`) and Teams (`com.tempoplugin.tempo-teams`)
apps come in the same OBR bundle, each with its own REST modules. The tools use the versions Tempo documents:

| Tool | Request |
|---|---|
| `tempo_getAccounts` | `GET /rest/tempo-accounts/1/account?skipArchived` |
| `tempo_getAccount` | `GET /rest/tempo-accounts/1/account/key/{accountKey}` |
| `tempo_getIssueAccount` | `GET /rest/tempo-accounts/1/account/issue/{issueKey}/current` |
| `tempo_getTeams` | `GET /rest/tempo-teams/2/team`, the teams `TeamVisibilityService` lets the user see |
| `tempo_getTeam` | `GET /rest/tempo-teams/2/team/{id}` |
| `tempo_getTeamMembers` | `GET /rest/tempo-teams/2/team/{id}/member?onlyActive` |
| `tempo_getUserTeams` | `GET /rest/tempo-teams/2/user/{userName}/memberships?from&to` |

An account carries `id`, `key`, `name`, `status`, `lead`, `contact`, `customer`, `category`, `monthlyBudget`, `global`
and `links`; a team `id`, `name`, `mission`, `summary`, `lead` and `program`; a member their `member` and their
`membership`, with `role`, `availability`, `dateFrom`, `dateTo` and `status`. `javap -c` on each handler found only
lookups: `AccountService.getAccounts`, `getAccountByKey` and `getCurrentAccountForIssue`, and `TeamService.getTeam`,
`getActiveUsers`, `getAllUsers` and `getMembershipsForUser`. Unit tests check each request's path and query.

**Not covered yet:** work attributes on a worklog; moving a worklog to another issue; and changing accounts and teams.
Plans, which Tempo Timesheets and Capacity Planner share, are read by the [Tempo Capacity
Planner](#tempo-capacity-planner) tools.

## JMWE

Jira Misc Workflow Extensions by Appfire, Marketplace key `com.innovalog.jmwe.jira-misc-workflow-extensions`. Added
in 0.48.0. It was the second app chosen from the Marketplace's most popular Data Center apps;
see the [roadmap](#roadmap) for why.

| | |
|---|---|
| Built from | JMWE **10.1.3** for Data Center (Marketplace build 900300580, released 2026-10-29) |
| Jira | 11.0 to 11.3, as this build's Marketplace listing gives |
| REST API used | `/rest/jmwe/1`, the API JMWE's own admin pages use. JMWE doesn't publish it as a public API |
| Tools | 8: 7 that read, in the toolsets `jmwe_workflows`, `jmwe_actions` and `jmwe_logs`, and 1 opt-in tool that runs a scheduled action, in `jmwe_actions` |
| Detection | `GET /rest/jmwe/1/status/picker` at startup, which reads Jira's statuses without a permission check, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live JMWE instance |

**How the tools were built.** The plugin declares one REST module, `jmwe` version 1, with its resources found by their
annotations. `javap` on them gave 91 routes. These tools use the list and get routes:

| Tool | Request |
|---|---|
| `jmwe_getWorkflowExtensions` | `GET /workflows`, or `GET /workflows/workflow?workflowName` for one workflow's extensions by transition |
| `jmwe_getSharedItems` | `GET /shared-actions`, `/shared-conditions`, `/shared-validators` or `/shared-scripts`, or one by id or name. Lists leave out each item's content unless asked (`skipContent`) |
| `jmwe_getEventBasedActions` | `GET /event-actions`, or `/event-actions/{actionId}` |
| `jmwe_getScheduledActions` | `GET /scheduled-actions`, or `/scheduled-actions/{actionId}` |
| `jmwe_getScheduledActionStatus` | `GET /scheduled-actions/status`: whether each is running, its last run and number of issues, its last error and its next run |
| `jmwe_getLogs` | `GET /logs?issueKey&extensionName&triggeredBy&errors&warnings&successes&skipped&page&pageSize`. JMWE's own defaults apply to what's left out: errors and warnings, 20 to a page |
| `jmwe_getLogDetails` | `GET /logs/{correlationId}` |

**Reading only reads.** `javap -c` on each of these handlers found no call that saves, changes or runs anything; the
only setters fill in the objects they answer with. One route needs care: `GET /scheduled-actions/{actionId}/run` runs a
scheduled action although it is a `GET`, so no read tool calls it, and a test checks the scheduled action read tools
stay on their list, get and status routes. Some handlers check Jira's global permissions themselves; none of the routes has a
resource filter.

**How they were checked.** Unit tests check each tool's path and query, the shared items' content switch, the logs'
defaults, and the 403 message. Detection is tested with all seven Jira apps installed, with only some of them, and with
`JIRA_APPS`. The catalog test checks that the tools are reached through the tool search unless `TOOLSETS` names their
toolset.

**Running a scheduled action.** `jmwe_runScheduledAction` calls that run route. `javap -c` shows it queues a manual run
(`ScheduledActionJobManager.createActionManualJobSchedule`) and answers at once, while the action works through its
issues in the background; the tool says so and points to `jmwe_getScheduledActionStatus` to follow the run. It follows
ScriptRunner's rule for running code: it is destructive, for Jira administrators, registered only when
`JIRA_JMWE_SCHEDULED_ACTION_RUN_ENABLED` is `true`, listed only when `TOOLSETS` names `jmwe_actions`, and never offered
by the tool search or `jira_runCode`. Unit tests check that it is registered only with its setting, its catalog entry,
and its request.

**Not covered yet:** running or testing Groovy and Nunjucks, switching actions on and off, changing actions, shared
items and preferences, and acknowledging or deleting logs.

## Structure

Structure by Tempo, formerly by ALM Works, Marketplace key `com.almworks.jira.structure`. Added in 0.48.0. It was the third app chosen from the Marketplace's most popular Data Center apps; see the
[roadmap](#roadmap) for why.

| | |
|---|---|
| Built from | Structure **9.14.1** for Data Center (Marketplace build 1004183, released 2026-10-21) |
| Jira | 9.12 to 11.3, as this build's Marketplace listing gives |
| REST API used | `/rest/structure/2.0`, which Tempo documents in its [Structure REST API reference](https://help.tempo.io/structure-dc/latest/structure-rest-api-reference) |
| Tools | 10 in the toolset `structure_hierarchies`: 5 that read, and 5 that create structures and folders and add, move and remove rows |
| Detection | `GET /rest/structure/2.0/structure?limit=1` at startup, the documented structure search, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live Structure instance |

**How the tools were built.** The plugin declares its REST modules once for each Jira line: `javax` resources for
Jira 9 and 10 and `jakarta` ones for Jira 11. `javap` on the version 2.0 resources gave the same 115 routes for both.
Tempo's reference documents the search, structure, forest and value routes these tools use, and calls version 2.0
not yet stable, so each new build is worth checking.

| Tool | Request |
|---|---|
| `structure_getStructures` | `GET /structure?name&permission&archived&limit&page&withOwner`. Structure matches the name, ignoring case, or the id, sorts by name, and allows up to 100 to a page; the tool asks for 25 unless told |
| `structure_getStructure` | `GET /structure/{id}?withOwner&withPermissions`. Structure gives the sharing rules only to those who control the structure |
| `structure_getStructureRows` | `GET /forest/latest?s={"structureId":…}` for the rows, then `POST /value` for the values of one page of them, each attribute as `text` |
| `structure_getIssueStructures` | `GET /rest/api/2/issue/{key}` for the issue's id, then `GET /structure/list?anchorIssue` |
| `structure_getStructureHistory` | `GET /history/{id}/versions?maxCount&maxVersion` |
| `structure_addIssues` | `POST /rest/api/2/search` for the issues' ids, `GET /forest/latest` for the rows and version, then `POST /forest/update` with an `add` action |
| `structure_moveRows` | `GET /forest/latest`, then `POST /forest/update` with a `move` action |
| `structure_removeRows` | `GET /forest/latest`, then `POST /forest/update` with a `remove` action. Destructive |
| `structure_createStructure` | `POST /structure` with a name and description |
| `structure_addFolder` | `GET /forest/latest`, then `POST /item/create` with the folder type |

**Reading the rows.** `/forest/latest` sends a structure's rows as a formula: comma-separated rows, each
`rowId:depth:item`, sometimes followed by a fourth field Structure keeps for itself. An issue's item is its id; any
other item is `typeId/id`, or `typeId//id` for a URI-encoded string id, and `itemTypes` names each type. `javap -c` on
Structure's `ItemSerializer` confirms the format Tempo documents. The tool turns each row into its rowId, depth, item
type (`issue`, `folder`, `generator`, ...) and item id, narrows them to one row's subtree or a depth when asked, and
asks `/value` for the page's values: `key`, `summary` and `status` unless other attributes are named. The attribute
ids are Structure's `CoreAttributeSpecs`; Structure converts numbers, times, durations, users and yes-or-no values to
text. `/value` lists the rows the user may not read, and the tool marks them `inaccessible`.

**The structures an issue is in.** `/structure/list` isn't in Tempo's reference. It lists your recent, favorite and
default structures and, given an issue id, the ones Structure's issue index says hold the issue and that you can view,
recent ones first, with their total. It shortens each list to a length it takes from a Jira setting, so the tool
reports the total and says when the list is shorter.

**The change history.** Structure records each change to a structure's rows as a new version, with the user or the
synchronizer that made it and each change in it: added, copied, moved or removed, the item at the top of the change,
how many rows it covered, and the issue's key and summary when the item is an issue the user may see. `javap -c` on
the history resource and its SQL shows that versions come newest first and that `maxVersion` is exclusive: the query
is `C_ID < (structureId << 32 | maxVersion)`, ordered by `C_ID` descending. So the tool's `beforeVersion` is sent as
`maxVersion`, and the oldest version of a full page is the next page's `beforeVersion`. The resource accepts a
`minVersion` but doesn't use it in 9.14.1, so the tool doesn't offer it. A change's item is written the way the
forest formula writes items, and is read the same way.

**Changing rows.** Tempo's reference shows `POST /forest/update` with `add`, `move` and `remove` actions, each placed by
row ids `under`, `after` and `before`, where 0 means the top level, the first place or the last. `add` takes a forest
in the formula's format with negative temporary row ids. `javap -c` on `ForestResource` gives the rest:
- Structure wants the forest's `version` back, so each tool reads the forest first and places the rows from it: last
  under the parent unless `afterRowId` names a sibling.
- The answer maps the temporary row ids to the new ones in `oldRowIds` and `newRowIds`.
- When Structure refuses a change, or needs the user to choose between two meanings of it, it answers 200 with
  `updateError`. The tools report that as an error. They can't answer Structure's question, so they say to make that
  change in Structure itself.
- Each action is applied whole or not at all, and the tools send one at a time.

A change can do more than change the rows. In a structure built by generators, moving a row between groups sets the
grouping field, moving it in a structure sorted by rank changes the rank, and removing a row a generator added through
an issue link deletes the link. Structure lists these in `effects`, which the tools return. Removing rows is
destructive, so the tool search never offers it. Structure decides who may change each structure, so these tools name
no Jira permission. `structure_addIssues` checks first that Jira finds every issue, and adds none if it doesn't.

**Creating structures and folders.** `POST /structure` checks that Structure's settings let the user create
structures, requires a name, and makes the user the owner; the tool sends only the name and description, so sharing is
left to Structure. A folder is an item Structure creates and places in one call, `POST /item/create`, with the type
`com.almworks.jira.structure:type-folder` and its name as the `summary` value (`FolderItemType` reads that key). The
request carries the forest's version, a negative temporary row id and the place, worked out as for the other changes.
`javap -c` on `ItemResource` shows it reads `items.version` only after it has made the folder, so the tool always
sends one (version 0); without it the folder would be made and the call would still fail. The answer gives the new row
id, the folder's item id, and Structure's form and field errors, which the tool reports.

**Reading only reads.** `javap -c` on each handler the read tools reach found no call that saves or changes anything:
they only build their answers, and `/value` sets the request's rendering context. Building the forest formula may give
an item type Structure hasn't met before a number in Structure's own type registry. Structure can rate-limit the
structure search per user, but only once an administrator turns that on; the tools then pass on its 429.

**How they were checked.** Unit tests check each tool's requests, the formula with issues, folders, generators and a
string id, the subtree and depth filters, paging, inaccessible rows, the issue lookup, the history's users,
synchronizers, changes and paging, and the 404 message. For the changes, they check each action's body and
placement, the temporary row ids, the issue lookup, refusals and Structure's questions, the effects, the new structure,
and the folder's request, new row and errors. Detection
is tested with all eight Jira apps installed, with only some of them, and with `JIRA_APPS`. The catalog test checks
that the tools are reached through the tool search unless `TOOLSETS` names their toolset.

**Not covered yet:** where in the structure each change happened (`GET /history/{id}/version/{v}` gives the parent rows
before and after); formula columns and other attributes with parameters, such as progress; generators and automation;
copying rows; sharing, renaming, archiving and deleting structures; and renaming folders.

## Zephyr Essential

Zephyr Essential by SmartBear, formerly Zephyr Squad and Zephyr for Jira, Marketplace key `com.thed.zephyr.je`. It
is a different app from [Zephyr](#zephyr), formerly Zephyr Scale. Added in 0.48.0. It was the
sixth app chosen from the Marketplace's most popular Data Center apps; see the [roadmap](#roadmap) for why.

| | |
|---|---|
| Built from | Zephyr Essential **11.1.0** for Data Center (Marketplace build 111010383, released 2026-11-05) |
| Jira | 11.0 to 11.3, as this build's Marketplace listing gives |
| REST API used | `/rest/zapi/latest` (ZAPI), which SmartBear documents. Its pages render in the browser, so the app's own response beans were the source |
| Tools | 10 in the toolset `zephyressential_tests`: 6 that read, and 4 that record execution and step results, create cycles and add tests to them |
| Detection | `GET /rest/zapi/latest/util/testExecutionStatus` at startup, the execution statuses any signed-in user reads, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live Zephyr Essential instance |

**How the tools were built.** The plugin declares two REST modules, `zephyr` and `zapi`, both version 1.0 and both
serving every resource it annotates. `javap` on its Jakarta resources gave 257 routes. These tools use ten:

| Tool | Request |
|---|---|
| `zephyressential_searchExecutions` | `GET /zql/executeSearch?zqlQuery&offset&maxRecords`. On `/rest/zapi/latest` the app allows up to 10,000 records a call (`ApplicationConstants.MAX_ITEM_IN_ZAPI_REQUEST_CALL`); the tool asks for up to 100 |
| `zephyressential_getTestSteps` | `GET /rest/api/2/issue/{key}` for the test's id, then `GET /teststep/{issueId}` |
| `zephyressential_getStepResults` | `GET /stepResult?executionId` |
| `zephyressential_getCycles` | `GET /rest/api/2/project/{key}` for the project's id, then `GET /cycle?projectId&versionId` |
| `zephyressential_getCycleFolders` | The project's id as above, then `GET /cycle/{cycleId}/folders?projectId&versionId` |
| `zephyressential_getRequirementCoverage` | `GET /traceability/testsByRequirement?requirementIdOrKeyList&versionId` |
| `zephyressential_recordResult` | `GET /util/testExecutionStatus` for the status's id, then `PUT /execution/{id}/execute` |
| `zephyressential_recordStepResult` | `GET /util/teststepExecutionStatus` for the status's id, then `PUT /stepResult/{id}` |
| `zephyressential_createCycle` | `GET /rest/api/2/project/{key}` for the project's id, then `POST /cycle` |
| `zephyressential_addTestsToCycle` | The project's id as above, then `POST /execution/addTestsToCycle`, then `GET /execution/jobProgress/{token}?type=add_tests_to_cycle_job_progress` until the job is done |

The answers are the app's JAXB beans, whose JSON names are their field names:
- `ZQLSearchResultBean` holds `executions` (`ZQLScheduleBean`: the test, cycle, version, folder, `status` with its
  `name`, who ran it and when, the assignee, the comment, and `defects` with `key`, `summary` and `status`) and
  `totalCount`.
- `TeststepBeanWrapper` holds `stepBeanCollection` (`TeststepBean`: `step`, `data`, `result`, `orderId`). The tool
  also takes a bare list, as older versions answered.
- `StepResultBean` gives each step's `status` as an id, and its `executionStatus` list names the ids.

**Cycles, folders and coverage.** `javap -c` on `CycleResourceDelegateImpl` shows `GET /cycle` answers an object of
cycles by id beside `recordsCount`; `-1` is the version's ad hoc cycle. Each cycle has its build, environment, dates,
`totalExecutions`, `totalExecuted`, and `executionSummaries.executionSummary` with a count for each status. Given a
project and no version, the same route groups the cycles by version instead, so the tool always sends a version: `-1`
for Unscheduled, or an id from `jira_getProjectVersions`. `GET /cycle/{cycleId}/folders` answers the cycle's folders
(`folderId`, `folderName`, `folderDescription`) with the same summaries. `TraceabilityResource` answers each
requirement with its `tests`, each with `test`, `executionStat` and `defectStat` (a `total` and `statuses` with a
`count` each), and `totalDefects`. The tools give the counts by status name.

**Recording results.** `ScheduleResource.executeExecution` hands the body to `ScheduleResourceDelegateImpl.editExecution`,
which reads `status` (a status id as a string), `comment` (up to 750 characters), and `defectList`, which replaces the
linked defects when `updateDefectList` is `"true"`. `StepResultResource.updateStepResult` reads the same fields from a
`StepResultBean`. Both answer the saved bean with the status as an id. The tools take a status by name or id, look it
up in the execution or step status list (so statuses an administrator added work too), refuse one Zephyr doesn't have
by naming the ones it does, and give the saved status by name. `zephyressential_getStepResults` now gives each step
result's `id` for `zephyressential_recordStepResult`. Both routes refuse an execution whose workflow is complete, with
a 400 and Zephyr's message.

**Creating and filling cycles.** `CycleResource.createCycle` checks the request with `inputCycleDataValidation`
(a name of up to 255 characters, a version of the project) and `CycleResourceDelegateImpl.createCycle` saves it,
answering `{ id, responseMessage }`. It answers 200 without an `id` when saving fails, which the tool reports as an
error. Dates are parsed with the signed-in user's Jira date picker format (`DateTimeStyle.DATE_PICKER`), the same
format `GET /cycle` shows them in, so the tool passes them through as given, such as `25/Nov/26`.
`ScheduleResourceDelegateImpl.addTestsToCycle` takes `issues` as keys or ids with `method` `"1"` (`"2"` adds a
saved filter's tests and `"3"` copies another cycle's) and runs the work as a job, answering a `jobProgressToken`.
The tool waits up to about 10 seconds on `GET /execution/jobProgress/{token}`, whose `progress` reaches 1 when the
job is done. The job's `message` is Zephyr's localized `cycle.operation.add.tests.warn` text, with six `<strong>`
slots in a fixed order: tests added, invalid, in another project, already in the cycle, not a test, and without
permission. The tool reads the slots by position, so it works in any language, and gives which of the tests it sent
each slot names. Slots hold issue keys, some inside links, so the tool looks only for the keys it sent rather than
stripping the markup. A message without slots is passed on as Zephyr wrote it.

**Who may record results.** Both routes check the project permissions Zephyr Essential adds to Jira,
`ZEPHYR_BROWSE_CYCLE` and `ZEPHYR_EDIT_EXECUTION`, through `ZephyrPermissionManagerImpl`. It checks them only when
Zephyr's own permissions are turned on (`JiraUtil.getPermissionSchemeFlag`); otherwise browsing the project is enough.
Jira's permission list would report `ZEPHYR_EDIT_EXECUTION` as missing for anyone not granted it, even with Zephyr's
permissions off, so the two tools aren't hidden by it. Creating a cycle checks `ZEPHYR_CREATE_CYCLE`, and adding
tests `ZEPHYR_CREATE_EXECUTION`, in the same way, so those tools aren't hidden either. A refusal says what Zephyr needs.

**Reading only reads.** `javap -c` on the read handlers found only reads from Zephyr's managers, and on
`StepResultManagerImpl`, which earlier Zephyr versions used to fill in missing step results on reading, only queries
(`ActiveObjects.find` and `count`).

**How they were checked.** Unit tests check each tool's request, the shape of what it returns, paging, the status
names, both test step answers, the page limit, the cycles with the ad hoc cycle and without the record count, the
folders, the coverage, and the 403 message. For results they check the body sent to each route, a status by name in
any case or by id, replacing, keeping and unlinking defects, a status Zephyr doesn't have, the comment limit, and the
403 message. For cycles they check the body of a new cycle, an answer without an id, the tests added and not added as
read from the job's message (including a link to a host whose name looks like a key, and a key that only starts
like one sent), a message without slots, a job that outlasts the wait, and a job's error. Detection is tested with all ten Jira apps
installed, with only some of them, and with `JIRA_APPS`.

**Not covered yet:** creating folders, adding the tests a filter finds or copying another cycle's, cloning cycles,
attachments, and the execution workflow (starting, completing and reopening an execution).

## Tempo Capacity Planner

Capacity Planner by Tempo Software, formerly Tempo Planner, Marketplace key `com.tempoplugin.tempo-planner`. Added
after 0.48.0. It was the seventh app chosen from the Marketplace's most popular Data Center apps; see the
[roadmap](#roadmap) for why.

| | |
|---|---|
| Built from | Capacity Planner **20.0.02** for Data Center (Marketplace build 7013312, released 2026-11-19) |
| Jira | 10.0 to 11.3, as this build's Marketplace listing gives |
| REST API used | `/rest/tempo-planning/1`, the planning API Tempo documents for Data Center in its published Planner OpenAPI. It comes from the bundled `tempo-plan-core` plugin, which Tempo Timesheets bundles too |
| Tools | 3, all read-only, in the toolset `tempoplanner_plans` |
| Detection | `GET /rest/tempo-planning/1/allocation` for one day in 1970 at startup, unless `JIRA_APPS` names the apps to offer. It answers whenever Capacity Planner or Tempo Timesheets is installed, since both serve the planning API; Timesheets uses it to plan time in the calendar |
| Status | Beta: not yet run against a live Capacity Planner instance |

**How the tools were built.** Capacity Planner is an OBR: the `tempo-planner` plugin with Tempo's core, accounts,
teams and `tempo-plan-core` plugins. The planning API is `tempo-plan-core`'s `tempo-planning` module, versions 1 and
2; `javap` on its Jakarta resources gave 48 version 1 routes, the same as in the `tempo-plan-core` that Tempo
Timesheets 20.0.1 bundles. Tempo's published Planner OpenAPI documents `/allocation`, `/allocation/{allocationId}`,
`/plan/search` and `/plan` with the same parameters. The tools use three routes:

| Tool | Request |
|---|---|
| `tempoplanner_getPlans` | `GET /allocation?assigneeKeys&assigneeType&planItemId&planItemType&startDate&endDate`. A person's plans use `assigneeType=user`, a team's `assigneeType=team` with its id; an issue's or project's id comes from Jira first. With none of these, the tool asks for your own plans, by your user key from `GET /rest/api/2/myself` |
| `tempoplanner_getPlan` | `GET /allocation/{allocationId}` |
| `tempoplanner_getPlansForReview` | `POST /plan-approval/plans-for-review` with `{ statusCodes, includePastPlans }`. This route is the one Capacity Planner's approval pages use; Tempo doesn't publish it |

The answers are `AllocationBean`s, serialized from their getters: `id`, `assignee` (`key` and `type`), `planItem`
(`type`, one of ISSUE, PROJECT, EPIC, VERSION, COMPONENT and SPRINT, with its `key`, `summary` or `name`), `start`
and `end`, `secondsPerDay`, `totalPlannedSeconds`, `commitment`, `description`, `recurrence` (`rule` and `endDate`)
and `planApproval`. `AllocationResource.throwIfInvalidParams` refuses `assigneeKeys` without `assigneeType` and
`planItemId` without `planItemType`, and the handler turns usernames into user keys, so either works. The tools give
hours rather than seconds. A plan's approval has a `statusCode` that `PlanWorkflowStatus.getCode` gives as 0 no
change, 1 awaiting review (created or requested), 2 rejected and 3 approved; the tools name it, with the requester,
the reviewer and the latest message. `getPlansForReview` lists the plans the signed-in user reviews.

**Reading only reads.** `javap -c` on the three handlers found only `AllocationService.getAllocations` and
`getAllocation`, and `PlanApprovalService.getPlanAllocationsForReview`.

**How they were checked.** Unit tests check your own plans by default, a team's plans with a repeating, awaiting plan,
an issue's and a project's plans by their ids, refusing a person with a team, an issue with a project and a period
that ends before it starts, one plan, the review list for each status, and the 403 message. Detection is tested with
every Jira app installed, with only some of them, and with `JIRA_APPS`.

**Not covered yet:** capacity, and planned against available time by person and team (`/planSchedule`); changing
plans; approving and rejecting plans; and plan search by account, customer or Jira filter (`POST /plan/search`).

## Timesheet Tracking

Timesheet Tracking for Jira by TouchDown Apps, Marketplace key `com.tda.timesheet.report`. Added in 0.48.0. It was the fifth app chosen from the Marketplace's most popular Data Center apps; see the
[roadmap](#roadmap) for why.

| | |
|---|---|
| Built from | Timesheet Tracking **9.3.8-jira-11** for Data Center (released 2026-09-17) |
| REST API used | `/rest/reportrest/1.0`, the API the app's own pages use. It isn't published |
| Tools | 3, all read-only, in the toolset `timesheettracking_work` |
| Detection | `GET /rest/reportrest/1.0/reportrestglobal/get-jira-settings` at startup, which reads Jira's time tracking settings for any signed-in user, unless `JIRA_APPS` names the apps to offer |
| Status | Beta: not yet run against a live Timesheet Tracking instance |

**How the tools were built.** The plugin declares three REST modules over one package; `javap` on the
`/rest/reportrest/1.0` resources gave 53 routes. The app's reports are drawn in the browser from Jira's worklogs,
which the Jira server already reads, so these tools cover what only the app holds: work plans, the time people plan
on issues, and timers.

| Tool | Request |
|---|---|
| `timesheettracking_getWorkPlans` | `POST /workplan/get-workplans` with `userKey`, `startedDate`, `endDate` and `jql` |
| `timesheettracking_getIssueWorkPlans` | `GET /workplan/get-issue-workplans?issueKey` |
| `timesheettracking_getTimers` | `GET /timer`, or `POST /timer/get-issue-timers` with `issueKey` for one issue |

`javap -c` on `WorkplanService` and `TimerService` shows what each answers:
- The work plan query takes its dates as `dd/MM/yyyy` and includes the whole last day. It lists only plans not yet
  completed, for the person's user key, and keeps those on issues the caller may manage. It calls `jql.isEmpty()`
  without a null check, so the tool always sends `jql`, empty when none is given. `timePlanned` is in seconds (the
  app's `reverseTimeFormatter` converts to seconds); the tools add hours and a total.
- `GET /timer` lists running timers: everyone's for Jira administrators, and the caller's own otherwise.
- The answers are the app's own objects, which Jackson writes field by field (`@JsonAutoDetect(fieldVisibility = ANY)`).

**Reading only reads.** The services' reads only fill in the objects they answer with. Some of the app's `GET`
routes delete: `saved-report/delete-report`, `timer/delete`, `timer/delete-all-timers`, `timer/delete-my-timers` and
`workplan/delete`. No tool calls them, and a test checks the timer tool stays on its reading routes.

**How they were checked.** Unit tests check each tool's request, the date format, the empty JQL, looking up the
caller's own user key, hours and totals, completed plans, stopped timers, the 403 message, and that dates in another
format are refused before any call. Detection is tested with all nine Jira apps installed, with only some of them, and
with `JIRA_APPS`.

**Not covered yet:** saved reports; creating, changing and deleting work plans; starting and stopping timers.

## Gliffy

Gliffy Diagrams for Confluence, Marketplace key `com.gliffy.integration.confluence`. Added in 0.48.0. It was the fourth app chosen from the Marketplace's most popular Data Center apps, and the first for
Confluence; see the [roadmap](#roadmap) for why.

| | |
|---|---|
| Built from | Gliffy **13.5.0** for Data Center (Marketplace build 9003001007931, released 2026-11-19) |
| Confluence | 10.0 to 10.2, as this build's Marketplace listing gives |
| REST API used | `/rest/gliffy/1.0`, the API Gliffy's own editor uses. Gliffy doesn't publish it, nor its file format |
| Tools | 4, all read-only, in the toolset `gliffy_diagrams` |
| Detection | `GET /rest/gliffy/1.0/transform/config` at startup, which lists Gliffy's file converters to any signed-in user, unless `CONFLUENCE_APPS` names the apps to offer |
| Status | Beta: not yet run against a live Gliffy instance |

**How the tools were built.** The plugin declares one REST module, `gliffy` version 1.0. `javap` on its Jakarta
resources gave 85 routes. These tools use three of them, and Confluence's own API for pages and attachments:

| Tool | Request |
|---|---|
| `gliffy_searchDiagrams` | `GET /diagrams?query&spaceKey&filterByUser&sort&order&results&index`. Gliffy sorts only when it is given both `sort` and `order`, so the tool sends both. `filterByUser` keeps the diagrams the user created |
| `gliffy_listPageDiagrams` | `GET /rest/api/content/{id}?expand=body.storage`, then the page's `gliffy` macros |
| `gliffy_getDiagram` | `GET /diagrams/{attachmentId}?version`, after `GET /rest/api/content/{id}/child/attachment?filename` when given a page and a name |
| `gliffy_getDiagramHistory` | `GET /diagrams/{attachmentId}/history?results&index` |

**Reading a diagram.** `GET /diagrams/{id}` answers with the diagram's details and its document as `gon`, Gliffy's
JSON format (`application/gliffy+json`). Its `/content` route answers with a stored HTML export instead, so the tool
doesn't use it. Gliffy documents neither, so the format comes from the Jackson annotations on Gliffy's own model in
its bundled `gliffy-transform` 2.38.3 (`com.gliffy.transform.gon.document.v1`):
- `stage.objects` holds the diagram's objects, each with `children`.
- An object's `graphic` names its `type` (`Shape`, `Line`, `Text`, `Svg`, `Image` and others) and holds the details
  under a key of that name.
- A `Text` child labels its shape or line, with the text as HTML in `Text.html`. In a group, text stands on its own.
- A line's ends are `constraints.startConstraint.StartPositionConstraint.nodeId` and
  `constraints.endConstraint.EndPositionConstraint.nodeId`.

The tool returns the shapes, each with its label, its type from the last part of its `uid` (such as `decision`) and
the group it is in, and the connections between them by label, up to 300 of each. `format: "json"` returns Gliffy's
document as it is.

**A page's diagrams.** Gliffy's own route for them, `GET /page/{pageId}/diagrams`, needs edit permission on the page
and lists draw.io files too, since the editor uses it to import. So the tool reads the page's `gliffy` macros, as the
draw.io tool does: `name` is the diagram's attachment name, on this page unless `pageid`, or `space` and `page` (a
title), name another, and `pagePin` or `version` pins a version. The parameter names come from the macro's definition
and `GliffyMacroBean`. The scanner that reads macros is now shared by the draw.io and Gliffy tools.

**Reading only reads.** `javap -c` on the handlers and on `ConfluenceDiagramManager` found no call that saves or changes
anything. Each checks that the user may view the attachment. Reading a diagram in Gliffy's older format converts it to
JSON and keeps the result in Gliffy's in-memory cache, without saving anything to Confluence.

**How they were checked.** Unit tests check each tool's requests, the diagram summary (labels from HTML, groups, free
text, connections and a loose end), the cap at 300, the page macros (pinned versions and diagrams from other pages),
finding a diagram by page and name, the history, and the 404 message. Detection is tested with draw.io and Gliffy
installed, with one of them, and with `CONFLUENCE_APPS`.

**Not covered yet:** creating and editing diagrams, which need an image Gliffy renders in the browser; drafts;
comments on a diagram.

## Jira Service Management

Atlassian's service desk app. Its tools are the `jira_service_desk` toolset, which is off until `TOOLSETS` names it.

| | |
|---|---|
| Built from | Adapted from [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian); the app version wasn't recorded |
| Run against | Jira Service Management **11.3.13** on Jira Software Data Center **11.3.13**, on 2026-11-26, as a Jira administrator with a personal access token |
| REST API used | `/rest/servicedeskapi` |
| Tools | 6 |
| Detection | None: the toolset is listed when you turn it on, and a call explains a 404 when the app isn't installed |
| Status | Functional: all 6 tools run against a live instance |

Raising a customer request uses an endpoint Jira Service Management marks experimental, so the tool sends the
`X-ExperimentalApi: opt-in` header that endpoint requires.

**What was run.** The bundled server was started over stdio against a service desk made from the IT service
management template, and each tool was called the way an MCP client calls it:

- `jira_getServiceDeskForProject` found the desk by its project key in any case, and answered `serviceDesk: null` for
  a project that isn't a service desk.
- `jira_getServiceDeskQueues` listed the template's 15 queues with their JQL, columns and issue counts, and paged
  with `start` and `limit`.
- `jira_getQueueIssues` returned a queue's issues with the queue's columns, SLA fields included.
- `jira_getRequestTypes` and `jira_getRequestTypeFields` listed the request types, and each type's fields with their
  required flags, schemas and valid values.
- `jira_createCustomerRequest` raised requests with select, priority and component values given by label, and with
  request participants; the values were read back from the issues. A missing required field and an unknown option
  label were refused before anything was created, and an unknown customer in `raiseOnBehalfOf` gave JSM's own error.
- An unknown service desk, queue or request type gave the tool's 404 message.

**Fixed by the run.** Priority and component names were sent as plain strings, which JSM refuses
([#68](https://github.com/tekthar/atlassian-data-center-mcp/issues/68)). They are now mapped to ids like select
options. JSM 11 doesn't return a desk `name`, a request type's `issueTypeId` or a field's `visible` flag, so the
tools leave those out.

## Checking newer builds

Apps release often, so each app's tools are checked against newer Data Center builds, the same way they were built:
the newest build is downloaded from the Marketplace, its REST routes are listed with `javap` from its JAX-RS
annotations, and the list is compared with the build the tools came from. The app's code is never run.

| App | Built from | Newest build checked | What changed |
|---|---|---|---|
| Xray | 8.6.0-j11 | 8.6.1-j11 (2026-11-09) | Nine routes added to `/rest/raven/1.0`: a JQL search for issue keys, adding tests by JQL to requirements, test plans, test sets and test executions, and moving tests between repository folders. They are outside Xray's public `/api`, and the tools don't use them. Nothing removed or changed |
| ScriptRunner | 9.46.0 | 10.20.0 (2026-11-11) | ScriptRunner 10 is the line for Jira 11 and moves its REST resources from `javax.ws.rs` to `jakarta.ws.rs`. The 138 routes of the three REST modules the tools use are the same, with the same parameters and permission filters, and `javap -p` on the 12 resource and request classes they reach shows the same methods apart from the package rename |
| draw.io for Confluence | 16.1.12 | 16.1.13 (2026-11-12) | The same 66 routes |
| draw.io for Jira | 11.2.1 | 11.2.1 | No newer build |
| Zephyr | 12.12.1-jira11 | 12.12.1-jira11 | No newer build |
| BigPicture | 8.70.11.6 | 8.70.11.6 | No newer build |
| Tempo Timesheets | 20.0.1 | 20.0.1 | No newer build |
| JMWE | 10.1.3 | 10.1.3 | No newer build |
| Structure | 9.14.1 | 9.14.1 | No newer build |
| Gliffy | 13.5.0 | 13.5.0 | No newer build |
| Timesheet Tracking | 9.3.8-jira-11 | 9.3.8-jira-11 | No newer build |
| Zephyr Essential | 11.1.0 | 11.1.0 | No newer build |

A route list says nothing about what a resource returns, so a change inside a response body would still need a live
instance to find. Please [open an issue](https://github.com/tekthar/atlassian-data-center-mcp/issues) if a tool stops
working after an app update.

## Roadmap

Apps are added in this order, each step in its own release-ready change.

1. **ScriptRunner for Jira**
   - [x] Read: script editor files, built-in scripts and the parameters they ask for, listeners, JQL functions,
     behaviours
   - [x] Opt-in, off by default: run Groovy in the script console, run a built-in script, create and save script
     editor files. Each is destructive, has its own setting, and is never offered by the tool search or
     `jira_runCode`
   - [x] More to read: scripted fields, scheduled jobs, REST endpoints, fragments, workflow functions
   - [x] Changing behaviours: create or replace one, switch it on or off, and add or remove its mappings (opt-in)
2. **draw.io for Confluence** (`com.mxgraph.confluence.plugins.diagramly`)
   - [x] App support in the Confluence server: detection, `CONFLUENCE_APPS`, and app toolsets reached through the tool
     search
   - [x] Read: find diagrams, list a page's diagrams, and read one as shapes and connections or as XML
   - [ ] Write: **blocked, needs a decision.** draw.io's save routes require a PNG preview, which this server can't
     render (see [draw.io for Confluence](#drawio-for-confluence)). The options are to send a placeholder preview that
     the editor replaces on its next save, but which shows in exports until then, or to render previews in the
     server, which means a heavy dependency. Until then, diagrams are read-only.
3. **draw.io for Jira** (`com.mxgraph.jira.plugins.drawio`)
   - [x] Read: list an issue's diagrams, and read one as shapes and connections or as XML
   - [ ] Write: blocked in the same way
4. **Zephyr** by SmartBear, formerly Zephyr Scale (`com.kanoah.test-manager`)
   - [x] Read: test cases, test cycles and their results, test plans, environments, and the test cases covering an
     issue
   - [x] Write: record a test result, and create test cases, test cycles and test plans
5. **BigPicture** by Appfire (`eu.softwareplant.bigpicture`)
   - [x] Read: the box hierarchy, boxes, box types and statuses, a Jira issue's boxes and BigPicture fields, teams and
     their members
   - [x] Write: set an issue's BigPicture fields, add boxes, and add, change and remove team members
   - [x] Read resource planning: skills, people's skills and absences, holiday and workload plans and who they apply
     to, and capacity
6. **Review** of the apps above for bugs and gaps
   - [x] Check each app against its newest Data Center build (2026-11-15). Xray, ScriptRunner and draw.io for
     Confluence had newer builds; none changed a route the tools call. See
     [Checking newer builds](#checking-newer-builds)
   - [x] Xray: the add tools now report the keys Xray left out, and `xray_getTests` takes a saved filter. See
     [Xray](#xray)
   - [x] ScriptRunner: no bug found against 10.20.0; built-in scripts can be validated and previewed before a run,
     behind the run setting. See [ScriptRunner](#scriptrunner)
   - [x] draw.io: reading a Confluence diagram's earlier revision could save a backup attachment; it never does now.
     draw.io for Jira had no bug. See [draw.io for Confluence](#drawio-for-confluence)
   - [x] Zephyr: no bug found; many results can be recorded in one call. See [Zephyr](#zephyr)
   - [x] BigPicture: no bug found; the issues a box plans can be listed. See [BigPicture](#bigpicture)
7. Then the most popular Data Center apps for Jira, Confluence and Bitbucket, one at a time, each with the reason it
   was chosen.
   - **Tempo Timesheets** (`is.origo.jira.tempo-plugin`), chosen on 2026-11-18. The Marketplace API's popular Data Center
     apps for Jira, by installs, were ScriptRunner (33,864), Microsoft Teams for Jira (26,205), Tempo Timesheets
     (25,855), Xray, JMWE (16,166) and Zephyr. ScriptRunner and Xray are supported already, and Microsoft Teams for
     Jira connects to Teams rather than holding project data an agent reads. Tempo holds data agents are asked about
     every day, logged time and timesheets, and documents a REST API for Data Center. For Confluence, draw.io (59,375)
     is supported and the next two are diagram apps, Lucidchart (25,240) and Gliffy (15,355); Bitbucket's most popular
     app has 1,857 installs.
     - [x] Read: worklogs, with total hours, timesheet periods, and approval statuses for a person, a team or a
       reviewer
     - [x] Write: log, change and delete time; submit, approve, reject and reopen timesheets
     - [x] Read Tempo accounts and teams
   - **JMWE** (`com.innovalog.jmwe.jira-misc-workflow-extensions`), chosen on 2026-11-20. It is the next most installed
     Jira app on the Marketplace's popular list (16,166) after the ones already supported and Microsoft Teams for Jira.
     Like ScriptRunner it holds workflow automation that administrators debug, and its execution logs answer why a
     post-function did or didn't run on an issue. Its REST API is the one its own admin pages use, not a published one.
     - [x] Read: workflow extensions, shared items, event-based and scheduled actions with their run status, and
       execution logs
     - [x] Opt-in: run a scheduled action, under ScriptRunner's rule (destructive, its own setting, never offered by the
       tool search or `jira_runCode`)
   - **Structure by Tempo** (`com.almworks.jira.structure`), chosen on 2026-11-21. On the Marketplace's popular Data
     Center apps for Jira, by installs, the most installed ones not yet supported were Microsoft Teams for Jira (26,193),
     Zendesk Support for Jira (12,806) and Structure (12,463). Like Microsoft Teams for Jira, Zendesk Support for Jira
     connects Jira to another service, and its tickets stay in Zendesk. Structure holds the hierarchies teams plan in,
     epics, stories and folders across projects, which agents are asked to read and summarize, and Tempo documents its
     REST API for Data Center.
     - [x] Read: find structures, one structure, a structure's rows with issue values, and the structures an issue is in
     - [x] Read: a structure's change history
     - [x] Write: add issues, and move and remove rows
     - [x] Write: create structures and folders
   - **Gliffy Diagrams for Confluence** (`com.gliffy.integration.confluence`), chosen on 2026-11-23. On the
     Marketplace's popular Data Center lists, after the apps already supported, the most installed were Microsoft Teams
     for Jira (26,187), Lucidchart Diagrams Connector (25,266), Gliffy (15,529) and Zendesk Support for Jira (12,798).
     Microsoft Teams, Lucidchart and Zendesk connect to another service and keep their data there. Gliffy keeps its
     diagrams in Confluence as page attachments, which agents are asked to read and explain, like draw.io's. It is the
     first app chosen for Confluence; the next for Jira, Timesheet Tracking for Jira (12,419), reports on worklogs the
     Jira server already reads.
     - [x] Read: find diagrams, list a page's diagrams, read one as shapes and connections or as Gliffy JSON, and its
       versions
   - **Timesheet Tracking for Jira** (`com.tda.timesheet.report`), chosen on 2026-11-23. The most installed apps not
     yet supported were then Table Filter, Charts & Spreadsheets for Confluence (14,830), Timesheet Tracking (12,419)
     and JSU Automation Suite (11,917). Table Filter filters and charts tables that are already page content, which the
     Confluence server reads. JSU serves three small REST resources, and its rules live in workflow definitions.
     Timesheet Tracking keeps its own data in Jira: the work people plan on issues, and their running timers, which
     agents are asked about when planning a week.
     - [x] Read: a person's work plans for a period, the work planned on an issue, and running timers
   - **Zephyr Essential** (`com.thed.zephyr.je`), formerly Zephyr Squad, chosen on 2026-11-24. Next on the popular
     Data Center list for Jira came Easy Reports Free (11,598), eazyBI (10,654), Status Time Reports Free (10,503),
     TestRail's Jira integration (10,218) and Zephyr Essential (9,753). Easy Reports keeps chart definitions over Jira
     data, and Status Time Reports works out time in status from Jira's own history; the Jira server reads both. eazyBI
     serves its API from a JRuby servlet rather than JAX-RS resources, so its routes can't be checked as the others
     were, and TestRail's app connects to TestRail. Zephyr Essential keeps test cycles, executions and step results in
     Jira, which agents are asked about at every release, and SmartBear documents its ZAPI.
     - [x] Read: test executions found with ZQL, a test's steps, and an execution's step results
     - [x] Read: cycles and folders, and test coverage of requirements
     - [x] Write: record execution and step results, with comments and defects
     - [x] Write: create cycles and add tests to them
   - **Tempo Capacity Planner** (`com.tempoplugin.tempo-planner`), formerly Tempo Planner, chosen on 2026-11-26. On the
     Marketplace's popular Data Center apps for Jira, the most installed ones not yet supported were then Microsoft
     Teams for Jira (26,164), Zendesk Support for Jira (12,772), JSU (11,934), Easy Reports Free (11,600), eazyBI
     (10,672), Status Time Reports Free (10,485), TestRail's integration (10,223), Rich Filters for Jira Dashboards
     (9,398), Time Tracker for Jira (9,387) and Capacity Planner (9,165). The first seven were passed over earlier for
     the reasons given above. Rich Filters builds dashboard gadgets over Jira filters, whose issues the Jira server
     already reads with JQL, and Time Tracker is Tempo's reporting over worklogs, which the Jira and Tempo Timesheets
     tools already read. Capacity Planner keeps its own data, the plans that allocate people's and teams' time to
     issues and projects, which agents are asked about when planning work, and Tempo publishes its API. On Confluence
     the next were Lucidchart (an external service), Table Filter (page content) and Scroll PDF Exporter (8,605),
     which exports pages rather than keeping data.
     - [x] Read: plans by person, team, issue or project, one plan, and plans awaiting your review
     - [ ] Read: capacity, and planned against available time by person and team
     - [ ] Write: create, change and delete plans, and approve or reject them
