# Supported apps

Marketplace apps add their own REST APIs. The Jira server, `mcp-jira-dc`, and the Confluence server,
`mcp-confluence-dc`, have tools for the apps below. The Bitbucket server doesn't support any apps yet.

| App | Server | Versions | Status |
|---|---|---|---|
| [Xray](#xray), test management | Jira | 8 | Beta |
| [ScriptRunner](#scriptrunner), scripting and automation | Jira | 9 and 10 | Beta |
| [Jira Service Management](#jira-service-management) | Jira | not recorded | Beta |
| [draw.io](#drawio-for-confluence), diagrams | Confluence | 16 | Beta, read-only |
| [draw.io](#drawio-for-jira), diagrams | Jira | 11 | Beta, read-only |
| [Zephyr](#zephyr), test management | Jira | 12 | Beta |
| [BigPicture](#bigpicture), portfolio and project management | Jira | 8 | Beta |
| [Tempo Timesheets](#tempo-timesheets), time tracking | Jira | 20 | Beta |

- **Tested** means the tools were run against a live instance of that app version.
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

**To mark it Tested**, we need the tools run against a live Xray 8 instance, including detection with an ordinary
user's token, since it hasn't been confirmed that every user can read the test statuses detection asks for.

## ScriptRunner

Scripting and automation by Adaptavist, Marketplace key `com.onresolve.jira.groovy.groovyrunner`. Added after 0.47.1,
in the next release.

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

Diagrams by Seibert (draw.io), Marketplace key `com.mxgraph.confluence.plugins.diagramly`. Added after 0.47.1, in the
next release.

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

Diagrams by Seibert (draw.io), Marketplace key `com.mxgraph.jira.plugins.drawio`. Added after 0.47.1, in the next
release.

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
`com.kanoah.test-manager`. Added after 0.47.1, in the next release.

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
Added after 0.47.1, in the next release.

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

Time tracking by Tempo Software, Marketplace key `is.origo.jira.tempo-plugin`. Added after 0.47.1, in the next
release. It was the first app chosen from the Marketplace's most popular Data Center apps; see the
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

**Not covered yet:** work attributes on a worklog; moving a worklog to another issue; changing accounts and teams;
and Tempo Planner.

## Jira Service Management

Atlassian's service desk app. Its tools are the `jira_service_desk` toolset, which is off until `TOOLSETS` names it.

| | |
|---|---|
| Built from | Adapted from [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian); the app version wasn't recorded |
| REST API used | `/rest/servicedeskapi` |
| Tools | 6 |
| Detection | None: the toolset is listed when you turn it on, and a call explains a 404 when the app isn't installed |
| Status | Beta: checked with unit tests against recorded responses |

Raising a customer request uses an endpoint Jira Service Management marks experimental, so the tool sends the
`X-ExperimentalApi: opt-in` header that endpoint requires.

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
