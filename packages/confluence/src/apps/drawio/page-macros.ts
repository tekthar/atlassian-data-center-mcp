import { unwrapCdata, xmlTags } from '@atlassian-dc-mcp/common';

/*
 * draw.io places diagrams on a page with macros in its storage format: `drawio` and `drawio-sketch`
 * show a diagram attached to the page, `inc-drawio` embeds one from another page (its `pageId`) or a
 * URL, and `diagramly` is the legacy macro. Parameter names come from the app's macro definitions.
 * The storage format is read with the common one-pass tag scanner, since page bodies are written by
 * other people.
 */
const DIAGRAM_MACROS = new Set(['drawio', 'drawio-sketch', 'inc-drawio', 'diagramly']);

export interface PageDiagram {
  macro: string;
  diagramName?: string;
  /** The page the diagram is attached to: this page, or another for an embedded diagram. */
  pageId?: string;
  displayName?: string;
  revision?: number;
  url?: string;
}

interface OpenMacro {
  name: string;
  order: number;
  params: Map<string, string>;
}

function describe(macro: OpenMacro, pageId: string): PageDiagram {
  const param = (name: string) => macro.params.get(name);
  const diagramName = param('diagramName');
  const revision = Number(param('revision'));
  return {
    macro: macro.name,
    ...(diagramName ? { diagramName, pageId: macro.name === 'inc-drawio' ? param('pageId') || pageId : pageId } : {}),
    ...(param('diagramDisplayName') ? { displayName: param('diagramDisplayName') } : {}),
    ...(Number.isFinite(revision) && revision > 0 ? { revision } : {}),
    ...(param('diagramUrl') ? { url: param('diagramUrl') } : {}),
  };
}

/** The draw.io diagrams a page shows, in the order its storage format places them. */
export function findPageDiagrams(storage: string, pageId: string): PageDiagram[] {
  const found: Array<{ order: number; diagram: PageDiagram }> = [];
  const open: OpenMacro[] = [];
  let parameter: { name: string; start: number } | undefined;
  for (const tag of xmlTags(storage)) {
    if (tag.name === 'ac:structured-macro' && !tag.selfClosing) {
      if (!tag.closing) open.push({ name: tag.attributes['ac:name'] ?? '', order: tag.start, params: new Map() });
      const closed = tag.closing ? open.pop() : undefined;
      if (closed && DIAGRAM_MACROS.has(closed.name)) found.push({ order: closed.order, diagram: describe(closed, pageId) });
    } else if (tag.name === 'ac:parameter' && !tag.selfClosing) {
      if (!tag.closing) parameter = { name: tag.attributes['ac:name'] ?? '', start: tag.end };
      else if (parameter && open.length) open[open.length - 1].params.set(parameter.name, unwrapCdata(storage.slice(parameter.start, tag.start)));
      if (tag.closing) parameter = undefined;
    }
  }
  return found.sort((a, b) => a.order - b.order).map((entry) => entry.diagram);
}
