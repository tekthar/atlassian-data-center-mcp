import { unwrapCdata, xmlTags } from '@atlassian-dc-mcp/common';

/*
 * Apps place their content on a page with macros in its storage format. The storage format is read with the
 * common one-pass tag scanner, since page bodies are written by other people.
 */

export interface StructuredMacro {
  name: string;
  params: Map<string, string>;
}

/** The page's macros with one of these names, with their parameters, in the order the page places them. */
export function structuredMacros(storage: string, names: Set<string>): StructuredMacro[] {
  const found: Array<StructuredMacro & { order: number }> = [];
  const open: Array<StructuredMacro & { order: number }> = [];
  let parameter: { name: string; start: number } | undefined;
  for (const tag of xmlTags(storage)) {
    if (tag.name === 'ac:structured-macro' && !tag.selfClosing) {
      if (!tag.closing) open.push({ name: tag.attributes['ac:name'] ?? '', order: tag.start, params: new Map() });
      const closed = tag.closing ? open.pop() : undefined;
      if (closed && names.has(closed.name)) found.push(closed);
    } else if (tag.name === 'ac:parameter' && !tag.selfClosing) {
      if (!tag.closing) parameter = { name: tag.attributes['ac:name'] ?? '', start: tag.end };
      else if (parameter && open.length) open[open.length - 1].params.set(parameter.name, unwrapCdata(storage.slice(parameter.start, tag.start)));
      if (tag.closing) parameter = undefined;
    }
  }
  return found.sort((a, b) => a.order - b.order).map(({ name, params }) => ({ name, params }));
}
