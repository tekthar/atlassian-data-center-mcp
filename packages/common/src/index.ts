import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import type { ToolAnnotations } from '@modelcontextprotocol/server';
import { AuditLog, auditServer } from './audit.js';
export * from './api-error-handler.js'
export * from './apps.js';
export * from './audit.js';
export * from './attachment-download.js'
export * from './attachment-gateway.js'
export * from './attachment-tool-response.js'
export * from './code-sandbox.js';
export * from './code-tool.js';
export * from './config/index.js';
export * from './drawio-file.js';
export * from './xml-tags.js';
export * from './gateway-tools.js';
export * from './path-encoding.js';
export * from './redact.js';
export * from './policy-registrar.js';
export * from './recording-registrar.js';
export * from './tool-gateway.js';
export * from './tool-policy.js';
export * from './tool-response.js'
export { runSetup, runSetupCli } from './setup-cli.js';
export { credentialValidator, type ValidatableService } from './credential-validator.js';
export { runDoctor, runDoctorCli, type DoctorOptions } from './doctor/doctor.js';
export { runInstallCli } from './install.js';
export { describeValidationError } from './setup/describe-error.js';
export { parseSetupArgs, printSetupHelp, SetupArgsError, type ParsedSetupArgs } from './setup/args.js';

export const readOnlyToolAnnotations: ToolAnnotations = { readOnlyHint: true };

// Error handler helper
export const handleError = (error: Error) => {
  console.error("Server error:", error);
  process.exit(1);
};

// Create a base server setup function
/** The MCP server, recording every tool call in the audit log when ATLASSIAN_DC_MCP_AUDIT is on. */
export function createMcpServer(options: {
  name: string;
  version: string;
}) {
  const server = new McpServer({
    name: options.name,
    version: options.version
  });
  const audit = AuditLog.fromEnv(options.name);
  return audit ? auditServer(server, audit) : server;
}

export async function connectServer(server: McpServer) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
