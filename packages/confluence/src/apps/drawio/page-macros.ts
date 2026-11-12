/*
 * draw.io places diagrams on a page with macros in its storage format: `drawio` and `drawio-sketch`
 * show a diagram attached to the page, `inc-drawio` embeds one from another page (its `pageId`) or a
 * URL, and `diagramly` is the legacy macro. Parameter names come from the app's macro definitions.
 */
const DIAGRAM_MACROS = ['drawio', 'drawio-sketch', 'inc-drawio', 'diagramly'];

const macroPattern = /<ac:structured-macro\b[^>]*\bac:name="([^"]+)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g;

const parameters = (body: string): Record<string, string> =>
  Object.fromEntries([...body.matchAll(/<ac:parameter\b[^>]*\bac:name="([^"]+)"[^>]*>([\s\S]*?)<\/ac:parameter>/g)]
    .map((match) => [match[1], match[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()]));

export interface PageDiagram {
  macro: string;
  diagramName?: string;
  /** The page the diagram is attached to: this page, or another for an embedded diagram. */
  pageId?: string;
  displayName?: string;
  revision?: number;
  url?: string;
}

/** The draw.io diagrams a page shows, in the order its storage format places them. */
export function findPageDiagrams(storage: string, pageId: string): PageDiagram[] {
  return [...storage.matchAll(macroPattern)]
    .filter((match) => DIAGRAM_MACROS.includes(match[1]))
    .map((match) => {
      const params = parameters(match[2]);
      const revision = Number(params.revision);
      return {
        macro: match[1],
        ...(params.diagramName ? { diagramName: params.diagramName } : {}),
        ...(params.diagramName ? { pageId: match[1] === 'inc-drawio' ? params.pageId || pageId : pageId } : {}),
        ...(params.diagramDisplayName ? { displayName: params.diagramDisplayName } : {}),
        ...(Number.isFinite(revision) && revision > 0 ? { revision } : {}),
        ...(params.diagramUrl ? { url: params.diagramUrl } : {}),
      };
    });
}
