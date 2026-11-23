import { structuredMacros, type StructuredMacro } from '../page-macros.js';

/*
 * Gliffy places a diagram on a page with the `gliffy` macro. Its `name` is the diagram's attachment name, on this
 * page unless `pageid`, or `space` and `page` (a title), name another; `pagePin` or `version` pins a revision.
 * Parameter names come from the app's macro definition and GliffyMacroBean.
 */
const GLIFFY_MACROS = new Set(['gliffy']);

export interface PageGliffyDiagram {
  diagramName?: string;
  displayName?: string;
  pageId?: string;
  page?: string;
  space?: string;
  version?: number;
}

function describe(macro: StructuredMacro, pageId: string): PageGliffyDiagram {
  const param = (name: string) => macro.params.get(name) || undefined;
  const version = Number(param('pagePin') ?? param('version'));
  const elsewhere = param('page') !== undefined;
  return {
    diagramName: param('name'),
    ...(param('displayName') ?? param('displayname') ? { displayName: param('displayName') ?? param('displayname') } : {}),
    ...(elsewhere && !param('pageid') ? { page: param('page'), space: param('space') } : { pageId: param('pageid') ?? pageId }),
    ...(Number.isInteger(version) && version > 0 ? { version } : {}),
  };
}

/** The Gliffy diagrams a page shows, in the order its storage format places them. */
export function findGliffyDiagrams(storage: string, pageId: string): PageGliffyDiagram[] {
  return structuredMacros(storage, GLIFFY_MACROS).map((macro) => describe(macro, pageId));
}
