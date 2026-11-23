import { AttachmentsService, ContentResourceService } from '../../confluence-client/index.js';
import { asArray, asRecord } from '../../tools/context.js';
import { callGliffy } from './client.js';
import { summarizeGliffyDiagram } from './gon.js';
import { findGliffyDiagrams } from './page-macros.js';

const DIAGRAM_FIELDS = [
  'attachmentId', 'name', 'displayName', 'pageId', 'pageName', 'spaceKey', 'spaceName',
  'version', 'creator', 'createDate', 'lastModifier', 'lastModified',
];

const when = (value: unknown) => (typeof value === 'number' ? new Date(value).toISOString() : value);

/** What Gliffy says about a diagram, without its links, friendly dates and content. */
function diagramDetails(value: unknown): Record<string, unknown> {
  const diagram = asRecord(value);
  return Object.fromEntries(DIAGRAM_FIELDS.filter((field) => diagram[field] !== undefined && diagram[field] !== null && diagram[field] !== '')
    .map((field) => [field, field.endsWith('Date') || field === 'lastModified' ? when(diagram[field]) : diagram[field]]));
}

export interface DiagramSearch {
  name?: string;
  spaceKey?: string;
  mine?: boolean;
  sort?: 'modified' | 'created' | 'title';
  limit?: number;
  start?: number;
}

/** Gliffy diagrams the user can see, by name, space or creator. Gliffy sorts only when given an order too. */
export async function searchDiagrams({ name, spaceKey, mine, sort, limit, start }: DiagramSearch, pageSize: number) {
  const order = sort === undefined ? undefined : sort === 'title' ? 'ascending' : 'descending';
  const found = asRecord(await callGliffy({
    method: 'GET',
    url: '/diagrams',
    query: { query: name, spaceKey, filterByUser: mine, sort, order, results: limit ?? pageSize, index: start ?? 0 },
  }, 'The diagram search'));
  return asArray(found.diagrams).map(diagramDetails);
}

/** The Gliffy diagrams a page shows, read from the gliffy macros in its storage format. */
export async function listPageDiagrams(pageId: string) {
  const page = asRecord(await ContentResourceService.getContentById(pageId, 'body.storage'));
  const storage = String(asRecord(asRecord(page.body).storage).value ?? '');
  return { pageId, title: page.title, diagrams: findGliffyDiagrams(storage, pageId) };
}

export interface DiagramRequest {
  diagramId?: string;
  pageId?: string;
  diagramName?: string;
  version?: number;
  format?: 'summary' | 'json';
}

/** The diagram's attachment id, given or found by name on its page. */
async function attachmentId({ diagramId, pageId, diagramName }: DiagramRequest): Promise<string> {
  if (diagramId) return diagramId.replace(/^att/, '');
  if (!pageId || !diagramName) throw new Error('Give diagramId, or pageId and diagramName.');
  const found = asRecord(await AttachmentsService.getAttachments(pageId, undefined, diagramName));
  const attachment = asArray(found.results).map(asRecord).find((candidate) => candidate.title === diagramName);
  if (!attachment) throw new Error(`Page ${pageId} has no Gliffy diagram named "${diagramName}".`);
  return String(attachment.id).replace(/^att/, '');
}

/** One diagram: who changed it and when, and its shapes and connections, or Gliffy's JSON. */
export async function getDiagram(request: DiagramRequest) {
  const id = await attachmentId(request);
  const diagram = asRecord(await callGliffy({
    method: 'GET', url: '/diagrams/{id}', path: { id }, query: { version: request.version },
  }, `Gliffy diagram ${id}`));
  return { ...diagramDetails(diagram), diagram: request.format === 'json' ? diagram.gon : summarizeGliffyDiagram(diagram.gon) };
}

/** A diagram's versions, newest first: who saved each and when. */
export async function getDiagramHistory(diagramId: string, limit = 20, start = 0) {
  const id = diagramId.replace(/^att/, '');
  const history = asRecord(await callGliffy({
    method: 'GET', url: '/diagrams/{id}/history', path: { id }, query: { results: limit, index: start },
  }, `Gliffy diagram ${id}`));
  return { diagramId: id, versions: history.numRevisions, revisions: asArray(history.revisions).map(diagramDetails) };
}
