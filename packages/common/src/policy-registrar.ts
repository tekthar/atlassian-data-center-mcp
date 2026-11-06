import type { McpServer, RegisteredTool, StandardSchemaWithJSON, ToolAnnotations, ToolCallback } from '@modelcontextprotocol/server';
import { codeToolName, registerCodeTool } from './code-tool.js';
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
  /** Read tools that sandboxed code may call, in registration order. */
  codeTools(): string[];
  /**
   * Call once after every tool is registered. Registers the gateway tools if any tool went to the
   * gateway, and the code tool if the policy allows it. Returns the names registered.
   */
  registerGatewayTools(options: { prefix: string; product: string }): string[];
}

export function createPolicyRegistrar(server: McpServer, catalog: ToolCatalog, policy: ToolPolicy): ServerToolRegistrar {
  const registered: string[] = [];
  const hidden: string[] = [];
  const gateway = createToolGateway();
  const codeCallable = createToolGateway();
  const offerToCode = (operation: GatewayOperation, annotations: ToolAnnotations) => {
    if (policy.codeExecution && operation.access === 'read' && annotations.readOnlyHint !== false) codeCallable.add(operation);
  };

  return {
    registerTool(name, config, cb) {
      const entry = catalog.tools[name];
      if (!entry) {
        throw new Error(`Tool "${name}" is missing from the tool catalog. Add it with a toolset and an access level.`);
      }
      const annotations = { ...annotationsFor(entry.access), ...config.annotations };
      const operation: GatewayOperation = {
        name, toolset: entry.toolset, access: entry.access, description: config.description ?? '', inputSchema: config.inputSchema, cb: cb as GatewayOperation['cb'],
      };
      if (isToolAllowed(name, entry, policy)) {
        registered.push(name);
        offerToCode(operation, annotations);
        return server.registerTool(name, { ...config, annotations }, cb);
      }
      if (isGatewayTool(name, entry, policy)) {
        gateway.add(operation);
        offerToCode(operation, annotations);
      } else if (isHiddenByPermission(name, entry, policy)) {
        hidden.push(name);
      }
      return undefined;
    },
    registeredTools: () => [...registered],
    hiddenByPermission: () => [...hidden],
    gatewayTools: () => gateway.operations().map((operation) => operation.name),
    codeTools: () => codeCallable.operations().map((operation) => operation.name),
    registerGatewayTools(options) {
      const codeTool = codeCallable.operations().length > 0 ? codeToolName(options.prefix) : undefined;
      const names = registerGatewayTools(server, gateway, { ...options, toolsets: catalog.toolsets, codeTool });
      return codeTool ? [...names, registerCodeTool(server, codeCallable, options)] : names;
    },
  };
}
