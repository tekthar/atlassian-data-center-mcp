/*
 * A single-pass reader for the tags of XML and XHTML that other people write: draw.io files, Confluence
 * storage format. Regular expressions over such text can take quadratic time on crafted input (many
 * unclosed tags, long runs of name characters), so this scanner only moves forward: each character is
 * read a bounded number of times. It is not a validating parser. It finds tags and their quoted
 * attributes, and skips comments, CDATA sections, processing instructions and declarations.
 */

export interface XmlTag {
  /** Tag name as written, e.g. `mxCell` or `ac:parameter`. */
  name: string;
  /** Attribute values as written, entities left encoded. The record has no prototype. */
  attributes: Record<string, string>;
  /** Index of the tag's `<`. */
  start: number;
  /** Index just after the tag's `>`. */
  end: number;
  closing: boolean;
  selfClosing: boolean;
}

const isNameChar = (char: string | undefined) =>
  char !== undefined && ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || '_:.-'.includes(char));

const isSpace = (char: string | undefined) => char === ' ' || char === '\t' || char === '\n' || char === '\r';

function skipSpace(xml: string, index: number): number {
  let i = index;
  while (isSpace(xml[i])) i += 1;
  return i;
}

/** Reads one attribute at `index`; returns where reading stopped, or -1 for an unterminated quoted value. */
function readAttribute(xml: string, index: number, attributes: Record<string, string>): number {
  let i = index;
  while (isNameChar(xml[i])) i += 1;
  const name = xml.slice(index, i);
  i = skipSpace(xml, i);
  if (xml[i] !== '=') return i;
  i = skipSpace(xml, i + 1);
  const quote = xml[i];
  if (quote !== '"' && quote !== '\'') return i;
  const close = xml.indexOf(quote, i + 1);
  if (close === -1) return -1;
  attributes[name] = xml.slice(i + 1, close);
  return close + 1;
}

/** The tag whose `<` is at `start`, or undefined when the text ends before its `>`. */
function readTag(xml: string, start: number): XmlTag | undefined {
  let i = start + 1;
  const closing = xml[i] === '/';
  if (closing) i += 1;
  const nameStart = i;
  while (isNameChar(xml[i])) i += 1;
  const name = xml.slice(nameStart, i);
  const attributes: Record<string, string> = Object.create(null);
  while (i < xml.length && xml[i] !== '>') {
    if (!isNameChar(xml[i])) {
      i += 1;
      continue;
    }
    const next = readAttribute(xml, i, attributes);
    if (next === -1) return undefined;
    i = next;
  }
  if (i >= xml.length) return undefined;
  return { name, attributes, start, end: i + 1, closing, selfClosing: xml[i - 1] === '/' };
}

const SKIPPED_SECTIONS: Array<[string, string]> = [['<!--', '-->'], ['<![CDATA[', ']]>']];

/** Where the next tag can start after a comment or CDATA section at `index`, or undefined if there is none there. */
function skipSection(xml: string, index: number): number | undefined {
  for (const [open, close] of SKIPPED_SECTIONS) {
    if (!xml.startsWith(open, index)) continue;
    const end = xml.indexOf(close, index + open.length);
    return end === -1 ? xml.length : end + close.length;
  }
  return undefined;
}

/** Every element tag in `xml`, in order. */
export function* xmlTags(xml: string): Generator<XmlTag> {
  let position = xml.indexOf('<');
  while (position !== -1) {
    const skipped = skipSection(xml, position);
    if (skipped !== undefined) {
      position = xml.indexOf('<', skipped);
      continue;
    }
    const tag = readTag(xml, position);
    if (!tag) return;
    if (tag.name) yield tag;
    position = xml.indexOf('<', tag.end);
  }
}

/** The text of a CDATA section, or the text unchanged when it isn't one. */
export function unwrapCdata(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>') ? trimmed.slice(9, -3) : trimmed;
}
