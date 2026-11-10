import { asRecord, stripNoise } from '../../tools/context.js';
import { callScriptRunner } from './client.js';

/** Stack trace lines kept when a console script fails; the rest are framework frames. */
const STACK_TRACE_LINES = 15;

interface ScriptRunSnapshot {
  log?: string;
  millisecondsTaken?: number;
}

interface ConsoleResult {
  output?: unknown;
  snapshot?: ScriptRunSnapshot;
}

/** A failed console script answers 500 with the exception and a stack trace; keep what helps fix the script. */
function trimScriptFailure(error: unknown): unknown {
  const { status, statusText, body } = asRecord(error);
  const failure = asRecord(body);
  if (status !== 500 || failure.message === undefined) return error;
  const stackTrace = typeof failure['stack-trace'] === 'string' ? failure['stack-trace'].split('\n').slice(0, STACK_TRACE_LINES).join('\n') : undefined;
  return Object.assign(new Error(String(failure.message)), {
    status,
    statusText,
    body: { exception: failure['exception-class-name'], message: failure.message, stackTrace, log: asRecord(failure.snapshot).log },
  });
}

/** Runs Groovy, inline or from a script file, in ScriptRunner's script console. */
export async function runConsoleScript(source: { script?: string; scriptPath?: string }) {
  try {
    const result = await callScriptRunner<ConsoleResult | undefined>('scriptrunner', { method: 'POST', url: '/user/exec', body: source }, 'The script console');
    return { output: result?.output, log: result?.snapshot?.log, millisecondsTaken: result?.snapshot?.millisecondsTaken };
  } catch (error) {
    throw trimScriptFailure(error);
  }
}

/** Runs a built-in script with the given parameter values; what it returns depends on the script. */
export async function runBuiltInScript(className: string, values: Record<string, unknown>) {
  return stripNoise(await callScriptRunner('scriptrunner', {
    method: 'POST',
    url: '/canned/{scriptName}',
    path: { scriptName: className },
    body: values,
  }, `Built-in script ${className}`));
}

/**
 * Writes a script editor file. ScriptRunner takes the content base64-encoded; POST refuses to replace an
 * existing file and PUT replaces it.
 */
export async function saveScriptFile(rootPath: string, filePath: string, content: string, overwrite: boolean) {
  await callScriptRunner('scriptrunner', {
    method: overwrite ? 'PUT' : 'POST',
    url: '/idea/file',
    query: { rootPath, filePath },
    body: Buffer.from(content, 'utf8').toString('base64'),
    mediaType: 'application/octet-stream',
  }, `Script root ${rootPath}`);
  return { rootPath, filePath, saved: true, bytes: Buffer.byteLength(content, 'utf8') };
}
