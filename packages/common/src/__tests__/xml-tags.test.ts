import { unwrapCdata, xmlTags } from '../xml-tags.js';

const names = (xml: string) => [...xmlTags(xml)].map((tag) => `${tag.closing ? '/' : ''}${tag.name}${tag.selfClosing ? '/' : ''}`);

describe('xmlTags', () => {
  it('reads tags and quoted attributes, including a > inside a value', () => {
    const [tag] = xmlTags('<mxCell id="a" value=\'1 > 0\' style="x"/>');

    expect(tag).toMatchObject({ name: 'mxCell', selfClosing: true, closing: false });
    expect({ ...tag.attributes }).toEqual({ id: 'a', value: '1 > 0', style: 'x' });
  });

  it('skips declarations, comments and CDATA sections', () => {
    expect(names('<?xml version="1.0"?><!DOCTYPE x><a><!-- <b> --><![CDATA[<c>]]></a>')).toEqual(['a', '/a']);
  });

  it('stops at a tag the text never closes', () => {
    expect(names('<a><b id="unterminated>')).toEqual(['a']);
    expect(names('<a><b')).toEqual(['a']);
  });

  it('unwraps a CDATA section and leaves other text alone', () => {
    expect(unwrapCdata(' <![CDATA[a <b>]]> ')).toBe('a <b>');
    expect(unwrapCdata(' plain ')).toBe('plain');
  });
});
