import { mergeToolCatalogs, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { CONFLUENCE_MODULES_CATALOG } from './tools/index.js';

/**
 * Every Confluence tool with its toolset and access level. The default toolsets expose the
 * same tools this server has always exposed, so setting nothing keeps existing setups unchanged.
 * A tool registered without an entry here fails at startup.
 */
/** The tools b1ff/atlassian-dc-mcp shipped; registered directly in index.ts. */
export const CONFLUENCE_CORE_CATALOG: ToolCatalog = {
  toolsets: {
    confluence_pages: { description: 'Search, read, create and update pages', default: true },
    confluence_spaces: { description: 'Search spaces', default: true },
    confluence_attachments: { description: 'Download and upload page attachments', default: true },
  },
  tools: {
    confluence_getContent: { toolset: 'confluence_pages', access: 'read' },
    confluence_searchContent: { toolset: 'confluence_pages', access: 'read' },
    confluence_createContent: { toolset: 'confluence_pages', access: 'write' },
    confluence_updateContent: { toolset: 'confluence_pages', access: 'write' },
    confluence_searchSpace: { toolset: 'confluence_spaces', access: 'read' },
    confluence_downloadAttachment: { toolset: 'confluence_attachments', access: 'read' },
    confluence_uploadAttachment: { toolset: 'confluence_attachments', access: 'write' },
  },
};

/** Core tools plus every module under tools/. New modules default to off. */
export const CONFLUENCE_TOOL_CATALOG = mergeToolCatalogs(CONFLUENCE_CORE_CATALOG, CONFLUENCE_MODULES_CATALOG);
