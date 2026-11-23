import { structuredMacros, type StructuredMacro } from '../page-macros.js';

/*
 * draw.io places diagrams on a page with macros in its storage format: `drawio` and `drawio-sketch`
 * show a diagram attached to the page, `inc-drawio` embeds one from another page (its `pageId`) or a
 * URL, and `diagramly` is the legacy macro. Parameter names come from the app's macro definitions.
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

function describe(macro: StructuredMacro, pageId: string): PageDiagram {
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
  return structuredMacros(storage, DIAGRAM_MACROS).map((macro) => describe(macro, pageId));
}
