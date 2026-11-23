import { drawioPlainLabel } from '@atlassian-dc-mcp/common';
import { asArray, asRecord } from '../../tools/context.js';

/*
 * A Gliffy diagram is a JSON document (application/gliffy+json) whose stage.objects are nodes with children. A
 * node's graphic names its type, Shape, Line, Text, Svg, Image and others, and holds the details under a key of
 * that name. A Text child is its parent's label, with the text as HTML in Text.html. A line's ends are
 * constraints.startConstraint.StartPositionConstraint.nodeId and constraints.endConstraint.EndPositionConstraint.nodeId.
 * The keys come from the Jackson annotations on Gliffy's own model (com.gliffy.transform.gon.document.v1).
 */

/** Most shapes and connections listed per diagram; the rest are counted. */
export const GLIFFY_MAX_ITEMS = 300;

interface Placed {
  node: Record<string, unknown>;
  parent?: Record<string, unknown>;
}

const typeOf = (node: Record<string, unknown>) => {
  const type = asRecord(node.graphic).type;
  return typeof type === 'string' ? type : undefined;
};

const children = (node: Record<string, unknown>) => asArray(node.children).map(asRecord);
const textOf = (node: Record<string, unknown>) => drawioPlainLabel(String(asRecord(asRecord(node.graphic).Text).html ?? ''));
const holdsLabel = (node?: Record<string, unknown>) => ['Shape', 'Line', 'Svg', 'Image'].includes(typeOf(node ?? {}) ?? '');

/** A Text child labels a shape or a line; elsewhere, such as in a group, text stands on its own. */
const isLabel = ({ node, parent }: Placed) => typeOf(node) === 'Text' && holdsLabel(parent);

function placeAll(nodes: Record<string, unknown>[], parent?: Record<string, unknown>, into: Placed[] = []): Placed[] {
  for (const node of nodes) {
    into.push({ node, parent });
    placeAll(children(node), node, into);
  }
  return into;
}

/** Its own text for a free text; its Text children for a shape or line; nothing for a group. */
function labelOf(node: Record<string, unknown>): string {
  if (typeOf(node) === 'Text') return textOf(node);
  if (!holdsLabel(node)) return '';
  return children(node).filter((child) => typeOf(child) === 'Text').map(textOf).filter(Boolean).join(' ');
}

const shapeOf = (node: Record<string, unknown>) =>
  (typeof node.uid === 'string' && node.uid ? node.uid.split('.').pop() : typeOf(node)?.toLowerCase());

const endOf = (line: Record<string, unknown>, end: 'start' | 'end') => {
  const key = end === 'start' ? 'StartPositionConstraint' : 'EndPositionConstraint';
  const nodeId = asRecord(asRecord(asRecord(line.constraints)[`${end}Constraint`])[key]).nodeId;
  return nodeId === undefined || nodeId === null ? undefined : String(nodeId);
};

const capped = <T>(items: T[]) => ({ items: items.slice(0, GLIFFY_MAX_ITEMS), more: Math.max(0, items.length - GLIFFY_MAX_ITEMS) });

/** A diagram as the shapes it holds and the connections between them, by label. */
export function summarizeGliffyDiagram(gon: unknown) {
  const placed = placeAll(asArray(asRecord(asRecord(gon).stage).objects).map(asRecord)).filter((item) => !isLabel(item));
  const byId = new Map(placed.map(({ node }) => [String(node.id), node]));
  const name = (id?: string) => {
    const node = id === undefined ? undefined : byId.get(id);
    return node ? labelOf(node) || shapeOf(node) || id : '(unconnected)';
  };
  const shapes = capped(placed.filter(({ node }) => typeOf(node) !== 'Line').map(({ node, parent }) => ({
    id: String(node.id),
    label: labelOf(node),
    ...(shapeOf(node) ? { shape: shapeOf(node) } : {}),
    ...(parent ? { in: labelOf(parent) || shapeOf(parent) } : {}),
  })));
  const connections = capped(placed.filter(({ node }) => typeOf(node) === 'Line').map(({ node }) => ({
    from: name(endOf(node, 'start')), to: name(endOf(node, 'end')), ...(labelOf(node) ? { label: labelOf(node) } : {}),
  })));
  return {
    shapes: shapes.items,
    connections: connections.items,
    ...(shapes.more || connections.more ? { notListed: { shapes: shapes.more, connections: connections.more } } : {}),
  };
}
