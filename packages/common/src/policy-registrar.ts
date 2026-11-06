import type { McpServer, RegisteredTool, StandardSchemaWithJSON, ToolAnnotations, ToolCallback } from '@modelcontextprotocol/server';
import { annotationsFor, isHiddenByPermission, isToolAllowed, type ToolCatalog, type ToolPolicy } from './tool-policy.js';

interface ToolConfig<InputArgs, OutputArgs> {
  title?: string;
  description?: string;
  inputSchema?: InputArgs;
  outputSchema?: OutputArgs;
  /** Overrides the annotations derived from the tool's catalog access level. */
  annotations?: ToolAnnotations;
}

/** Same call shape as `McpServer.registerTool`, but only registers tools the policy allows. */
export interface PolicyRegistrar {
  registerTool<OutputArgs extends StandardSchemaWithJSON, InputArgs extends StandardSchemaWithJSON | undefined = undefined>(
    name: string,
    config: ToolConfig<InputArgs, OutputArgs>,
    cb: ToolCallback<InputArgs>,
  ): RegisteredTool | undefined;
  /** Names registered so far, in registration order. */
  registeredTools(): string[];
  /** Tools the server tried to register that only the permission check kept out. */
  hiddenByPermission(): string[];
}

export function createPolicyRegistrar(server: McpServer, catalog: ToolCatalog, policy: ToolPolicy): PolicyRegistrar {
  const registered: string[] = [];
  const hidden: string[] = [];

  return {
    registerTool(name, config, cb) {
      const entry = catalog.tools[name];
      if (!entry) {
        throw new Error(`Tool "${name}" is missing from the tool catalog. Add it with a toolset and an access level.`);
      }
      if (!isToolAllowed(name, entry, policy)) {
        if (isHiddenByPermission(name, entry, policy)) hidden.push(name);
        return undefined;
      }
      registered.push(name);
      const annotations = { ...annotationsFor(entry.access), ...config.annotations };
      return server.registerTool(name, { ...config, annotations }, cb);
    },
    registeredTools: () => [...registered],
    hiddenByPermission: () => [...hidden],
  };
}
