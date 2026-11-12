import { drawioDiagramDetails, readDrawioPages, summarizeDrawioPage } from '@atlassian-dc-mcp/common';
import { asRecord } from '../../tools/context.js';
import { callDrawio } from './client.js';

/** The draw.io diagrams attached to an issue. */
export async function listIssueDiagrams(issueKey: string) {
  const diagrams = await callDrawio<unknown[] | undefined>({
    method: 'GET',
    url: '/diagram/list/{issueKey}',
    path: { issueKey },
  }, `Issue ${issueKey}`);
  return { issueKey, diagrams: (diagrams ?? []).map(drawioDiagramDetails) };
}

/** One diagram: who changed it and when, and each page as shapes and connections, or as XML. */
export async function getDiagram(issueKey: string, diagramName: string, format: 'summary' | 'xml' = 'summary') {
  const diagram = asRecord(await callDrawio({
    method: 'GET',
    url: '/diagram/crud/{diagramName}/{issueKey}',
    path: { diagramName, issueKey },
  }, `Diagram "${diagramName}" on ${issueKey}`));
  const pages = readDrawioPages(String(diagram.xml ?? ''));
  return { issueKey, ...drawioDiagramDetails(diagram), pages: format === 'xml' ? pages : pages.map(summarizeDrawioPage) };
}
