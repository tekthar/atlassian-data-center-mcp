import { stripNoise } from '../../tools/context.js';
import { callScriptRunner, type ScriptRunnerApi } from './client.js';

type Query = Record<string, string | boolean | undefined>;

const get = async (api: ScriptRunnerApi, url: string, subject: string, query?: Query, path?: Record<string, string>) =>
  stripNoise(await callScriptRunner(api, { method: 'GET', url, query, path }, subject));

interface FileMeta {
  isFile?: boolean;
  file?: boolean;
}

interface ScriptRoot {
  info?: { rootPath?: string; defaultRoot?: boolean };
  files?: Record<string, FileMeta>;
}

const isDirectory = (meta: FileMeta | undefined) => meta?.isFile === false || meta?.file === false;

/** The script editor's roots, each with the paths of its files; directories end with a slash. */
export async function listScriptFiles(groovyOnly: boolean, includeDirectories: boolean) {
  const roots = await callScriptRunner<ScriptRoot[] | undefined>('scriptrunner', {
    method: 'GET',
    url: '/idea/scriptroots',
    query: { showDirectories: includeDirectories, groovyFilesOnly: groovyOnly },
  }, 'The script roots');
  return (roots ?? []).map(({ info, files }) => ({
    rootPath: info?.rootPath,
    defaultRoot: info?.defaultRoot ?? false,
    files: Object.entries(files ?? {}).map(([filePath, meta]) => (isDirectory(meta) ? `${filePath}/` : filePath)),
  }));
}

/** One script editor file, decoded: ScriptRunner sends its content as base64. */
export async function getScriptFile(rootPath: string, filePath: string) {
  const file = await callScriptRunner<{ content?: string } | undefined>('scriptrunner', {
    method: 'GET',
    url: '/idea/file',
    query: { rootPath, filePath },
  }, `Script file ${filePath}`);
  return { rootPath, filePath, content: Buffer.from(file?.content ?? '', 'base64').toString('utf8') };
}

interface BuiltInScript {
  className?: string;
  name?: string;
  description?: string;
  tags?: string[];
  helpUrl?: string;
}

const mentions = (script: BuiltInScript, text: string) =>
  [script.name, script.description, script.className, ...(script.tags ?? [])].some((value) => value?.toLowerCase().includes(text));

/** The built-in scripts this ScriptRunner offers, optionally only those whose name, description or tags mention `search`. */
export async function listBuiltInScripts(search: string | undefined) {
  const scripts = await callScriptRunner<BuiltInScript[] | undefined>('scriptrunner', { method: 'GET', url: '/canned/available' }, 'The built-in scripts');
  const text = search?.trim().toLowerCase();
  return (scripts ?? [])
    .filter((script) => !text || mentions(script, text))
    .map(({ className, name, description, tags, helpUrl }) => ({ className, name, description, tags, helpUrl }));
}

/** The parameters a built-in script asks for, given the values chosen so far; ScriptRunner computes them and runs nothing. */
export async function getBuiltInScriptParams(className: string, values: Record<string, unknown>) {
  return stripNoise(await callScriptRunner('scriptrunner', {
    method: 'POST',
    url: '/canned/{scriptName}/params',
    path: { scriptName: className },
    body: values,
  }, `Built-in script ${className}`));
}

export const getListeners = () => get('scriptrunner-jira', '/listeners', 'The ScriptRunner listeners');

/** The documentation of ScriptRunner's JQL functions; this route leaves out each function's script file. */
export const getJqlFunctions = () => get('scriptrunner-jira', '/jqlfunctions/docs', 'The ScriptRunner JQL functions');

export function getBehaviours(id: string | undefined) {
  return id === undefined
    ? get('scriptrunner/behaviours', '/admin/behaviour', 'The behaviours')
    : get('scriptrunner/behaviours', '/admin/behaviour/{id}', `Behaviour ${id}`, undefined, { id });
}
