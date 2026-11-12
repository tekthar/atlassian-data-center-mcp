import { inflateRawSync } from 'node:zlib';

/*
 * A draw.io file is an <mxfile> with one <diagram> per page. Each page holds an <mxGraphModel>, either
 * as XML or compressed: the URI-encoded XML, deflated without a header, then base64-encoded. The
 * model's <mxCell>s are the shapes (vertex="1") and the connections (edge="1"); a cell wrapped in
 * <UserObject> or <object> takes its id and label from the wrapper.
 */

/** Most shapes and connections listed per page; the rest are counted. */
export const MAX_CELLS_PER_PAGE = 300;

export interface DiagramPage {
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

const attributes = (text: string): Record<string, string> =>
  Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));

const decodeEntities = (text: string): string => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

/** Tags that end a line, so their text doesn't run into the next. */
const LINE_BREAKING_TAG = /^<\/?(br|div|p|li|tr|h[1-6])\b/i;

/**
 * A label as plain text. draw.io labels are often HTML, escaped once more inside the attribute: unescape
 * the attribute, split the HTML into tags and text, and keep only the text, unescaped. The result is
 * text for the agent, never HTML, so a `<` it contains is a character the label shows.
 */
export function plainLabel(value: string | undefined): string {
  const html = decodeEntities(value ?? '');
  return html.split(/(<[^>]*>)/)
    .map((token) => (token.startsWith('<') && token.endsWith('>') ? (LINE_BREAKING_TAG.test(token) ? ' ' : '') : decodeEntities(token)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function inflatePage(body: string): string {
  try {
    return decodeURIComponent(inflateRawSync(Buffer.from(body, 'base64')).toString('utf8'));
  } catch {
    return body;
  }
}

/** The pages of a draw.io file, with each page's model as XML; a bare model is one page. */
export function readPages(fileXml: string): DiagramPage[] {
  const pages = [...fileXml.matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)];
  if (pages.length === 0) return [{ name: 'Page-1', xml: fileXml.trim() }];
  return pages.map((match, index) => {
    const body = match[2].trim();
    return { name: decodeEntities(attributes(match[1]).name ?? `Page-${index + 1}`), xml: body.startsWith('<') ? body : inflatePage(body) };
  });
}

function toCell(cellAttributes: Record<string, string>, wrapper?: Record<string, string>): Cell {
  return {
    id: wrapper?.id ?? cellAttributes.id ?? '',
    label: plainLabel(wrapper?.label ?? cellAttributes.value),
    style: cellAttributes.style ?? '',
    vertex: cellAttributes.vertex === '1',
    edge: cellAttributes.edge === '1',
    parent: cellAttributes.parent,
    source: cellAttributes.source,
    target: cellAttributes.target,
  };
}

function readCells(modelXml: string): Cell[] {
  const wrapped = /<(UserObject|object)\b([^>]*)>\s*<mxCell\b([^>]*?)\/?>/g;
  const cells = [...modelXml.matchAll(wrapped)].map((match) => toCell(attributes(match[3]), attributes(match[2])));
  const rest = modelXml.replace(wrapped, '');
  return cells.concat([...rest.matchAll(/<mxCell\b([^>]*?)\/?>/g)].map((match) => toCell(attributes(match[1]))));
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

const capped = <T>(items: T[]) => ({ items: items.slice(0, MAX_CELLS_PER_PAGE), more: Math.max(0, items.length - MAX_CELLS_PER_PAGE) });

/** A page as the shapes it holds and the connections between them, by label. */
export function summarizePage(page: DiagramPage) {
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
