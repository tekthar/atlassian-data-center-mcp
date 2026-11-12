import { inflateRawSync } from 'node:zlib';
import { xmlTags } from './xml-tags.js';

/*
 * draw.io files, shared by the draw.io apps for Confluence and Jira. A draw.io file is an <mxfile> with one <diagram> per page. Each page holds an <mxGraphModel>, either
 * as XML or compressed: the URI-encoded XML, deflated without a header, then base64-encoded. The
 * model's <mxCell>s are the shapes (vertex="1") and the connections (edge="1"); a cell wrapped in
 * <UserObject> or <object> takes its id and label from the wrapper.
 */

/** Most shapes and connections listed per page; the rest are counted. */
export const DRAWIO_MAX_CELLS_PER_PAGE = 300;

export interface DrawioPage {
  name: string;
  xml: string;
}

interface Cell {
  id: string;
  label: string;
  style: string;
  vertex: boolean;
  edge: boolean;
  parent?: string;
  source?: string;
  target?: string;
}

const decodeEntities = (text: string): string => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

/** Tags that end a line, so their text doesn't run into the next. */
const LINE_BREAKING_TAG = /^<\/?(br|div|p|li|tr|h[1-6])\b/i;

/** The text of HTML, read in one pass: tags dropped, line-breaking tags as spaces, entities decoded. */
function htmlText(html: string): string {
  let text = '';
  let position = 0;
  while (position < html.length) {
    const open = html.indexOf('<', position);
    const close = open === -1 ? -1 : html.indexOf('>', open);
    if (close === -1) return text + decodeEntities(html.slice(position));
    text += decodeEntities(html.slice(position, open)) + (LINE_BREAKING_TAG.test(html.slice(open, close + 1)) ? ' ' : '');
    position = close + 1;
  }
  return text;
}

/**
 * A label as plain text. draw.io labels are often HTML, escaped once more inside the attribute: unescape
 * the attribute, then keep only the HTML's text, unescaped. The result is text for the agent, never HTML,
 * so a `<` it contains is a character the label shows.
 */
export function drawioPlainLabel(value: string | undefined): string {
  return htmlText(decodeEntities(value ?? '')).replace(/\s+/g, ' ').trim();
}

function inflatePage(body: string): string {
  try {
    return decodeURIComponent(inflateRawSync(Buffer.from(body, 'base64')).toString('utf8'));
  } catch {
    return body;
  }
}

/** The pages of a draw.io file, with each page's model as XML; a bare model is one page. */
export function readDrawioPages(fileXml: string): DrawioPage[] {
  const pages: DrawioPage[] = [];
  let open: { name?: string; contentStart: number } | undefined;
  for (const tag of xmlTags(fileXml)) {
    if (tag.name !== 'diagram' || tag.selfClosing) continue;
    if (!tag.closing) {
      open = { name: tag.attributes.name, contentStart: tag.end };
    } else if (open) {
      const body = fileXml.slice(open.contentStart, tag.start).trim();
      pages.push({ name: decodeEntities(open.name ?? `Page-${pages.length + 1}`), xml: body.startsWith('<') ? body : inflatePage(body) });
      open = undefined;
    }
  }
  return pages.length > 0 ? pages : [{ name: 'Page-1', xml: fileXml.trim() }];
}

function toCell(cellAttributes: Record<string, string>, wrapper?: Record<string, string>): Cell {
  return {
    id: wrapper?.id ?? cellAttributes.id ?? '',
    label: drawioPlainLabel(wrapper?.label ?? cellAttributes.value),
    style: cellAttributes.style ?? '',
    vertex: cellAttributes.vertex === '1',
    edge: cellAttributes.edge === '1',
    parent: cellAttributes.parent,
    source: cellAttributes.source,
    target: cellAttributes.target,
  };
}

const WRAPPERS = new Set(['UserObject', 'object']);

/** Every cell of a model in one pass; a cell inside <UserObject> or <object> takes the wrapper's id and label. */
function readCells(modelXml: string): Cell[] {
  const cells: Cell[] = [];
  let wrapper: Record<string, string> | undefined;
  for (const tag of xmlTags(modelXml)) {
    if (WRAPPERS.has(tag.name)) {
      wrapper = tag.closing || tag.selfClosing ? undefined : tag.attributes;
    } else if (tag.name === 'mxCell' && !tag.closing) {
      cells.push(toCell(tag.attributes, wrapper));
      wrapper = undefined;
    }
  }
  return cells;
}

/** The shape a style names: its first bare token, such as `ellipse`, or its `shape=` value. */
function shapeOf(style: string): string | undefined {
  const tokens = style.split(';').filter(Boolean);
  if (tokens[0] && !tokens[0].includes('=')) return tokens[0];
  return tokens.find((token) => token.startsWith('shape='))?.slice('shape='.length);
}

const isEdgeLabel = (cell: Cell, byId: Map<string, Cell>) =>
  cell.style.startsWith('edgeLabel') && cell.parent !== undefined && byId.get(cell.parent)?.edge === true;

function describeShapes(cells: Cell[], byId: Map<string, Cell>) {
  return cells.filter((cell) => cell.vertex && !isEdgeLabel(cell, byId)).map((cell) => {
    const container = cell.parent ? byId.get(cell.parent) : undefined;
    return {
      id: cell.id,
      label: cell.label,
      ...(shapeOf(cell.style) ? { shape: shapeOf(cell.style) } : {}),
      ...(container?.vertex ? { in: container.label || container.id } : {}),
    };
  });
}

function describeConnections(cells: Cell[], byId: Map<string, Cell>) {
  const name = (id: string | undefined) => (id === undefined ? undefined : byId.get(id)?.label || id);
  const labels = new Map(cells.filter((cell) => isEdgeLabel(cell, byId)).map((cell) => [cell.parent as string, cell.label]));
  return cells.filter((cell) => cell.edge).map((edge) => {
    const label = edge.label || labels.get(edge.id);
    return { from: name(edge.source) ?? '(unconnected)', to: name(edge.target) ?? '(unconnected)', ...(label ? { label } : {}) };
  });
}

const capped = <T>(items: T[]) => ({ items: items.slice(0, DRAWIO_MAX_CELLS_PER_PAGE), more: Math.max(0, items.length - DRAWIO_MAX_CELLS_PER_PAGE) });

/** A page as the shapes it holds and the connections between them, by label. */
export function summarizeDrawioPage(page: DrawioPage) {
  const cells = readCells(page.xml);
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const shapes = capped(describeShapes(cells, byId));
  const connections = capped(describeConnections(cells, byId));
  return {
    name: page.name,
    shapes: shapes.items,
    connections: connections.items,
    ...(shapes.more || connections.more ? { notListed: { shapes: shapes.more, connections: connections.more } } : {}),
  };
}

const DIAGRAM_FIELDS = [
  'name', 'displayName', 'pageId', 'attachmentId', 'spaceKey', 'spaceName',
  'revision', 'headRevision', 'lastModified', 'lastModifierName', 'creatorName',
];

/** What draw.io says about a diagram, without its file, links and thumbnails. */
export function drawioDiagramDetails(value: unknown): Record<string, unknown> {
  const diagram = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(DIAGRAM_FIELDS.filter((field) => diagram[field] !== undefined && diagram[field] !== null).map((field) => [field, diagram[field]]));
}
