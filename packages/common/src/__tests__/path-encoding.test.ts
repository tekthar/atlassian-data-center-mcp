import { encodePathParam, UnsafePathParameterError } from '../path-encoding.js';

describe('encodePathParam', () => {
  it.each([
    ['10200', 'linkId', '10200'],
    ['ABC-123', 'issueIdOrKey', 'ABC-123'],
    ['1.0.2', 'id', '1.0.2'],
    ['../project/ABC', 'linkId', null],
    ['..', 'id', null],
    ['.', 'id', null],
    ['a/../b', 'id', null],
    ['..\\project', 'id', null],
  ])('encodes %p for single-segment parameter %p', (value, name, expected) => {
    if (expected === null) {
      expect(() => encodePathParam(value, name)).toThrow(UnsafePathParameterError);
    } else {
      expect(encodePathParam(value, name)).toBe(expected);
    }
  });

  it('encodes separators that would otherwise change the request target', () => {
    expect(encodePathParam('7/merge?version=3#', 'pullRequestId')).toBe('7%2Fmerge%3Fversion%3D3%23');
    expect(encodePathParam('ABC-1?deleteSubtasks=true', 'issueIdOrKey')).toBe('ABC-1%3FdeleteSubtasks%3Dtrue');
  });

  it('refuses an empty single-segment parameter', () => {
    expect(() => encodePathParam('', 'linkId')).toThrow('it is empty');
  });

  it('keeps slashes in file paths but encodes each segment', () => {
    expect(encodePathParam('src/main/a b#c?.ts', 'path')).toBe('src/main/a%20b%23c%3F.ts');
    expect(encodePathParam('/docs/readme.md', 'path')).toBe('/docs/readme.md');
    expect(encodePathParam('', 'path')).toBe('');
  });

  it('refuses dot segments in file paths', () => {
    expect(() => encodePathParam('src/../../secret', 'path')).toThrow(UnsafePathParameterError);
    expect(() => encodePathParam('./a', 'path')).toThrow(UnsafePathParameterError);
  });
});
