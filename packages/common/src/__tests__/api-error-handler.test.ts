import { handleApiOperation, MAX_TEXT_ERROR_DETAILS, summarizeErrorDetails } from '../api-error-handler.js';

const apiError = (body: unknown) => Object.assign(new Error('Not Found'), { status: 404, statusText: 'Not Found', body });

describe('handleApiOperation', () => {
  it('wraps a successful result', async () => {
    expect(await handleApiOperation(async () => ({ id: 1 }), 'Error')).toEqual({ success: true, data: { id: 1 } });
  });

  it('keeps a JSON error body as details', async () => {
    const body = { errorMessages: ['Issue does not exist'] };

    expect(await handleApiOperation(async () => { throw apiError(body); }, 'Error fetching issue')).toEqual({
      success: false,
      error: 'Error fetching issue: 404 Not Found',
      details: body,
    });
  });

  it('truncates a long text body such as an HTML error page', async () => {
    const html = `<html>${'x'.repeat(5000)}</html>`;

    const result = await handleApiOperation(async () => { throw apiError(html); }, 'Error');

    expect(typeof result.details).toBe('string');
    expect((result.details as string).length).toBeLessThan(MAX_TEXT_ERROR_DETAILS + 60);
    expect(result.details).toContain(`truncated, ${html.length} characters`);
  });
});

describe('summarizeErrorDetails', () => {
  it('leaves short text and non-text values alone', () => {
    expect(summarizeErrorDetails('Not Found')).toBe('Not Found');
    expect(summarizeErrorDetails(undefined)).toBeUndefined();
    expect(summarizeErrorDetails({ a: 1 })).toEqual({ a: 1 });
  });
});
