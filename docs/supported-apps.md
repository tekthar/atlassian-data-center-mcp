# Supported apps

Marketplace apps add their own REST APIs. The Jira server, `mcp-jira-dc`, and the Confluence server,
`mcp-confluence-dc`, have tools for the apps below. The Bitbucket server doesn't support any apps yet.

| App | Server | Versions | Status |
|---|---|---|---|
| [Xray](#xray), test management | Jira | 8 | Beta |
| [ScriptRunner](#scriptrunner), scripting and automation | Jira | 9 | Beta |
| [Jira Service Management](#jira-service-management) | Jira | not recorded | Beta |
| [draw.io](#drawio-for-confluence), diagrams | Confluence | 16 | Beta, read-only |
| [draw.io](#drawio-for-jira), diagrams | Jira | 11 | Beta, read-only |

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

**Not covered yet.** Removing tests from executions, plans and sets (removing a test from an execution deletes its
results), test repository folders, preconditions, datasets, and importing automated test results.

**To mark it Tested**, we need the tools run against a live Xray 8 instance, including detection with an ordinary
user's token, since it hasn't been confirmed that every user can read the test statuses detection asks for.

## ScriptRunner

Scripting and automation by Adaptavist, Marketplace key `com.onresolve.jira.groovy.groovyrunner`. Added after 0.47.1,
in the next release.

| | |
|---|---|
| Built from | ScriptRunner for Jira **9.46.0** for Data Center (Marketplace build 1011110, released 2026-10-20) |
| Jira | 10.0 to 10.7, as this build's Marketplace listing gives. Its REST resources use `javax.ws.rs` |
| REST APIs used | `/rest/scriptrunner/latest` for the script editor, built-in scripts, the script console, scheduled jobs, REST endpoints and fragments; `/rest/scriptrunner-jira/latest` for listeners, scripted fields, workflow functions and JQL functions; `/rest/scriptrunner/behaviours/latest` for behaviours |
| Tools | 12 that read, in the toolsets `scriptrunner_script_editor`, `scriptrunner_builtin_scripts`, `scriptrunner_features` and `scriptrunner_behaviours`; 7 opt-in tools that run or save code or change behaviours, in `scriptrunner_console`, `scriptrunner_builtin_scripts`, `scriptrunner_script_editor` and `scriptrunner_behaviours` |
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
`scriptrunner_runBuiltInScript`, `scriptrunner_saveScriptFile` and the four behaviour tools
(`scriptrunner_saveBehaviour`, `scriptrunner_setBehaviourEnabled`, `scriptrunner_mapBehaviour` and
`scriptrunner_unmapBehaviour`) can change anything on the instance, or the screens of everyone who uses it. So each is
guarded in four ways:

- It is destructive.
- It is registered only when its own setting is `true`: `JIRA_SCRIPTRUNNER_CONSOLE_ENABLED`,
  `JIRA_SCRIPTRUNNER_BUILTIN_RUN_ENABLED`, `JIRA_SCRIPTRUNNER_FILE_SAVE_ENABLED`, or, for all four behaviour tools,
  `JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED`.
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
- With the feature tools added, the tool search ranked the right tool first for "scheduled jobs", "scripted field",
  "rest endpoint", "workflow post function" and "web panel fragment". A `jira_runCode` script read the scheduled jobs.

**Other 9.x versions** are expected to work, but only 9.46.0 was read, so an earlier version may lack a route.

**Left out on purpose:**

- **Deleting a behaviour.** Switching one off keeps it and its mappings, and can be undone.
- **Previewing or validating a built-in script before running it.** Those routes exist, but this build doesn't show
  that they never change anything.
- **ScriptRunner's resources.** These are database and other connections, and their settings can hold passwords.
- **Script search.** It lists the same files as the script editor.

The XML behaviours configuration (`/config`) isn't used: the JSON admin routes cover the same behaviours.

## draw.io for Confluence

Diagrams by Seibert (draw.io), Marketplace key `com.mxgraph.confluence.plugins.diagramly`. Added after 0.47.1, in the
next release.

| | |
|---|---|
| Built from | draw.io for Confluence **16.1.12** for Data Center (Marketplace build 16001001200) |
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

**Not covered yet:** creating and editing diagrams. As in Confluence, a save needs a PNG preview ("A save reached the
image writer with no preview"); see the [roadmap](#roadmap). Revision history needs the attachment's id and version
too.

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
5. **BigPicture** by Appfire (`eu.softwareplant.bigpicture`)
6. Then a review of the apps above for bugs and gaps, followed by the most popular Data Center apps for Jira,
   Confluence and Bitbucket.
