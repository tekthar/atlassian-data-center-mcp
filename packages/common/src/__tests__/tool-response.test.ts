import { formatToolResponse } from '../tool-response.js';

describe('formatToolResponse', () => {
  it('returns one text block for a successful result', () => {
    expect(formatToolResponse({ success: true, data: { key: 'ABC-1' } })).toEqual({
      content: [{ type: 'text', text: '{"success":true,"data":{"key":"ABC-1"}}' }],
    });
  });

  it('marks a failed result with isError', () => {
    const failure = { success: false, error: 'Error deleting issue: 403' };

    expect(formatToolResponse(failure)).toEqual({
      content: [{ type: 'text', text: JSON.stringify(failure) }],
      isError: true,
    });
  });

  it('leaves values without a success flag unmarked', () => {
    expect(formatToolResponse('plain')).not.toHaveProperty('isError');
    expect(formatToolResponse(null)).not.toHaveProperty('isError');
  });
});
