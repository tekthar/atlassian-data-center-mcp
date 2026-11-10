import { z } from 'zod';

const CLASS_NAME = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

export const scriptRunnerToolSchemas = {
  listScriptFiles: {
    groovyOnly: z.boolean().optional().describe('List only .groovy files (default false)'),
    includeDirectories: z.boolean().optional().describe('Also list directories, ending with "/" (default false)'),
  },
  getScriptFile: {
    rootPath: z.string().min(1).describe('The script root the file is in, as scriptrunner_listScriptFiles gives it'),
    filePath: z.string().min(1).describe('The file\'s path inside that root, as scriptrunner_listScriptFiles gives it, e.g. "com/acme/Escalate.groovy"'),
  },
  listBuiltInScripts: {
    search: z.string().optional().describe('Only built-in scripts whose name, description or tags contain this text, e.g. "bulk" or "project"'),
  },
  getBuiltInScriptParams: {
    className: z.string().regex(CLASS_NAME, 'Expected a class name from scriptrunner_listBuiltInScripts')
      .describe('The built-in script\'s className, from scriptrunner_listBuiltInScripts'),
    values: z.record(z.string(), z.unknown()).optional()
      .describe('Values chosen so far, keyed by parameter name. Some parameters appear only after others are set, so call again with them.'),
  },
  getListeners: {},
  getJqlFunctions: {},
  getBehaviours: {
    id: z.string().min(1).optional().describe('A behaviour\'s id, to get its fields, scripts and mappings; leave out to list every behaviour'),
  },
};
