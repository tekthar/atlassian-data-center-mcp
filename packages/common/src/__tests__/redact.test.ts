import { clearRegisteredSecrets, redactLogText, redactSecrets, redactStderr, registerSecret } from '../redact.js';
import { formatToolResponse } from '../tool-response.js';

const TOKEN = 'NjM4MTI2NjAxOTQ1OkqLz8Rk2Vt9mQe3wXb7HcU1';

describe('redact', () => {
  beforeEach(() => clearRegisteredSecrets());

  it('masks a registered token wherever it appears in a tool result', () => {
    registerSecret(TOKEN);

    const result = formatToolResponse({ success: false, error: `Request failed`, details: { echoed: `Bearer ${TOKEN}`, again: TOKEN } });

    expect(result.content[0].text).not.toContain(TOKEN);
    expect(result.content[0].text).toContain('[REDACTED]');
  });

  it('leaves tool results alone apart from registered secrets', () => {
    const issue = 'Set the header "Authorization: Bearer abcdefghijkl" when calling the API';

    expect(redactSecrets(issue)).toBe(issue);
  });

  it('ignores empty and short values, which could be ordinary text', () => {
    registerSecret('');
    registerSecret(undefined);
    registerSecret('abc');

    expect(redactSecrets('abc and more')).toBe('abc and more');
  });

  it('masks credential-shaped fields in log text, even unregistered ones', () => {
    const line = 'GET /rest failed: Authorization: Bearer eyJhbGciOiJIUzI1 token=abcdef123456 {"password":"hunter2hunter2"} Basic dXNlcjpwYXNzd29yZA==';

    const masked = redactLogText(line);

    expect(masked).not.toMatch(/eyJhbGciOiJIUzI1|abcdef123456|hunter2hunter2|dXNlcjpwYXNzd29yZA/);
  });

  it('masks stderr writes from any code once enabled', () => {
    registerSecret(TOKEN);
    const written: string[] = [];
    const original = process.stderr.write;
    process.stderr.write = ((chunk: string) => { written.push(String(chunk)); return true; }) as typeof process.stderr.write;
    try {
      redactStderr();
      process.stderr.write(`failed with token ${TOKEN}\n`);
      process.stderr.write(Buffer.from(`buffer ${TOKEN}\n`));
    } finally {
      process.stderr.write = original;
    }

    expect(written.join('')).not.toContain(TOKEN);
    expect(written).toHaveLength(2);
  });
});
