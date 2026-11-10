import { z } from 'zod';

const CLASS_NAME = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

const className = z.string().regex(CLASS_NAME, 'Expected a class name from scriptrunner_listBuiltInScripts')
  .describe('The built-in script\'s className, from scriptrunner_listBuiltInScripts');

const rootPath = z.string().min(1).describe('The script root the file is in, as scriptrunner_listScriptFiles gives it');

/** Largest script or file the tools send, in characters. */
export const MAX_SCRIPT_CHARS = 200_000;

export const scriptRunnerToolSchemas = {
  listScriptFiles: {
    groovyOnly: z.boolean().optional().describe('List only .groovy files (default false)'),
    includeDirectories: z.boolean().optional().describe('Also list directories, ending with "/" (default false)'),
  },
  getScriptFile: {
    rootPath,
    filePath: z.string().min(1).describe('The file\'s path inside that root, as scriptrunner_listScriptFiles gives it, e.g. "com/acme/Escalate.groovy"'),
  },
  listBuiltInScripts: {
    search: z.string().optional().describe('Only built-in scripts whose name, description or tags contain this text, e.g. "bulk" or "project"'),
  },
  getBuiltInScriptParams: {
    className,
    values: z.record(z.string(), z.unknown()).optional()
      .describe('Values chosen so far, keyed by parameter name. Some parameters appear only after others are set, so call again with them.'),
  },
  getListeners: {},
  getJqlFunctions: {},
  getBehaviours: {
    id: z.string().min(1).optional().describe('A behaviour\'s id, to get its fields, scripts and mappings; leave out to list every behaviour'),
  },
  runConsoleScript: {
    script: z.string().min(1).max(MAX_SCRIPT_CHARS).optional().describe('Groovy to run. Its last expression is returned as the output.'),
    scriptPath: z.string().min(1).optional().describe('Run this script file instead, by its path in a script root, e.g. "com/acme/Fix.groovy"'),
  },
  runBuiltInScript: {
    className,
    values: z.record(z.string(), z.unknown())
      .describe('Parameter values keyed by name, as scriptrunner_getBuiltInScriptParams lists them'),
  },
  saveScriptFile: {
    rootPath,
    filePath: z.string().min(1).describe('The file\'s path inside that root, e.g. "com/acme/Escalate.groovy"; missing folders are created'),
    content: z.string().max(MAX_SCRIPT_CHARS).describe('The whole new content of the file'),
    overwrite: z.boolean().optional().describe('Replace the file if it exists (default false: refuse to)'),
  },
};
