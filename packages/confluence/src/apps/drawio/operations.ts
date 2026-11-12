import { ContentResourceService } from '../../confluence-client/index.js';
import { asArray, asRecord } from '../../tools/context.js';
import { callDrawio } from './client.js';
import { readPages, summarizePage } from './diagram-xml.js';
import { findPageDiagrams } from './page-macros.js';

export interface DiagramSearch {
  name?: string;
  spaceKeys?: string[];
  mine?: boolean;
  limit?: number;
}

/** What a found diagram says about itself, without the links and thumbnails draw.io adds. */
const describeFound = (value: unknown) => {
  const diagram = asRecord(value);
  const fields = ['name', 'pageId', 'attachmentId', 'spaceKey', 'spaceName', 'revision', 'lastModified', 'lastModifierName', 'creatorName'];
  return Object.fromEntries(fields.filter((field) => diagram[field] !== undefined && diagram[field] !== null).map((field) => [field, diagram[field]]));
};

/** draw.io diagrams anywhere the user can see, newest first, by name, space or author. */
export async function searchDiagrams({ name, spaceKeys, mine, limit }: DiagramSearch, pageSize: number) {
  const found = await callDrawio({
    method: 'GET',
    url: '/diagramSearch',
    query: { diagramName: name, spaceKeys, currentUser: mine, maxResults: limit ?? pageSize, diagramTypes: 'DRAWIO' },
  }, 'The diagram search');
  return asArray(found).map(describeFound);
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
  const pages = readPages(String(diagram.xml ?? ''));
  const { xml: _xml, thumbnailURL: _thumbnail, downloadURL: _download, ...details } = diagram;
  return { ...details, pages: format === 'xml' ? pages : pages.map(summarizePage) };
}
