import type { McpServer, RegisteredTool, StandardSchemaWithJSON, ToolAnnotations, ToolCallback } from '@modelcontextprotocol/server';
import { registerGatewayTools } from './gateway-tools.js';
import { createToolGateway, type GatewayOperation } from './tool-gateway.js';
import { annotationsFor, isGatewayTool, isHiddenByPermission, isToolAllowed, type ToolCatalog, type ToolPolicy } from './tool-policy.js';

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

/** The server's registrar: tools outside the selected toolsets go to the tool gateway when the policy allows. */
export interface ServerToolRegistrar extends PolicyRegistrar {
  /** Tools offered through the gateway so far, in registration order. */
  gatewayTools(): string[];
  /** Call once after every tool is registered; registers the gateway tools if any tool went to the gateway. */
  registerGatewayTools(options: { prefix: string; product: string }): string[];
}

export function createPolicyRegistrar(server: McpServer, catalog: ToolCatalog, policy: ToolPolicy): ServerToolRegistrar {
  const registered: string[] = [];
  const hidden: string[] = [];
  const gateway = createToolGateway();

  return {
    registerTool(name, config, cb) {
      const entry = catalog.tools[name];
      if (!entry) {
        throw new Error(`Tool "${name}" is missing from the tool catalog. Add it with a toolset and an access level.`);
      }
      if (isToolAllowed(name, entry, policy)) {
        registered.push(name);
        const annotations = { ...annotationsFor(entry.access), ...config.annotations };
        return server.registerTool(name, { ...config, annotations }, cb);
      }
      if (isGatewayTool(name, entry, policy)) {
        const { description = '', inputSchema } = config;
        gateway.add({ name, toolset: entry.toolset, access: entry.access, description, inputSchema, cb: cb as GatewayOperation['cb'] });
      } else if (isHiddenByPermission(name, entry, policy)) {
        hidden.push(name);
      }
      return undefined;
    },
    registeredTools: () => [...registered],
    hiddenByPermission: () => [...hidden],
    gatewayTools: () => gateway.operations().map((operation) => operation.name),
    registerGatewayTools: (options) => registerGatewayTools(server, gateway, { ...options, toolsets: catalog.toolsets }),
  };
}
