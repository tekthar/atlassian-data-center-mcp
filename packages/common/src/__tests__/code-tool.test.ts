import { toolResultValue } from '../code-tool.js';
import { formatToolResponse } from '../tool-response.js';

describe('toolResultValue', () => {
  it('returns the data of a successful service result', () => {
    expect(toolResultValue(formatToolResponse({ success: true, data: { key: 'A-1' } }))).toEqual({ key: 'A-1' });
  });

  it('throws the error and details of a failed service result', () => {
    const failed = formatToolResponse({ success: false, error: 'Get issue failed: 404 Not Found', details: { errorMessages: ['nope'] } });

    expect(() => toolResultValue(failed)).toThrow('Get issue failed: 404 Not Found {"errorMessages":["nope"]}');
  });

  it('returns other JSON as parsed, and plain text as text', () => {
    expect(toolResultValue(formatToolResponse([1, 2]))).toEqual([1, 2]);
    expect(toolResultValue({ content: [{ type: 'text', text: 'hello' }] })).toBe('hello');
  });

  it('throws on an error result without a service envelope, and omits non-text content', () => {
    expect(() => toolResultValue({ content: [{ type: 'text', text: 'bad input' }], isError: true })).toThrow('bad input');
    expect(toolResultValue({ content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x', mimeType: 'image/png' }] }))
      .toBe('a\n[image content omitted]');
  });
});
