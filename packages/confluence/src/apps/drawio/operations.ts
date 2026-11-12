import { drawioDiagramDetails, readDrawioPages, summarizeDrawioPage } from '@atlassian-dc-mcp/common';
import { ContentResourceService } from '../../confluence-client/index.js';
import { asArray, asRecord } from '../../tools/context.js';
import { callDrawio } from './client.js';
import { findPageDiagrams } from './page-macros.js';

export interface DiagramSearch {
  name?: string;
  spaceKeys?: string[];
  mine?: boolean;
  limit?: number;
}

/** draw.io diagrams anywhere the user can see, newest first, by name, space or author. */
export async function searchDiagrams({ name, spaceKeys, mine, limit }: DiagramSearch, pageSize: number) {
  const found = await callDrawio({
    method: 'GET',
    url: '/diagramSearch',
    query: { diagramName: name, spaceKeys, currentUser: mine, maxResults: limit ?? pageSize, diagramTypes: 'DRAWIO' },
  }, 'The diagram search');
  return asArray(found).map(drawioDiagramDetails);
}

/** The diagrams a page shows, read from the draw.io macros in its storage format. */
export async function listPageDiagrams(pageId: string) {
  const page = asRecord(await ContentResourceService.getContentById(pageId, 'body.storage'));
  const storage = String(asRecord(asRecord(page.body).storage).value ?? '');
  return { pageId, title: page.title, diagrams: findPageDiagrams(storage, pageId) };
}

export interface DiagramRequest {
  pageId: string;
  diagramName: string;
  revision?: number;
  format?: 'summary' | 'xml';
}

/** One diagram: who changed it and when, and each page as shapes and connections, or as XML. */
export async function getDiagram({ pageId, diagramName, revision, format = 'summary' }: DiagramRequest) {
  const diagram = asRecord(await callDrawio({
    method: 'GET',
    url: '/diagram/crud/{diagramName}/{owningPageId}',
    path: { diagramName, owningPageId: pageId },
    query: { revision },
  }, `Diagram "${diagramName}" on page ${pageId}`));
  const pages = readDrawioPages(String(diagram.xml ?? ''));
  return { ...drawioDiagramDetails(diagram), pages: format === 'xml' ? pages : pages.map(summarizeDrawioPage) };
}
