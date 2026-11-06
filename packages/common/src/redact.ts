/*
 * Keeps credentials out of what the servers write: tool results go to the model and the MCP client, and
 * stderr often ends up in client log files. Each server registers its token when it reads its configuration;
 * every later tool result and stderr line has it masked.
 */

const REDACTED = '[REDACTED]';

// A shorter value could be ordinary text; real tokens are far longer.
const MIN_SECRET_LENGTH = 8;

const BEARER = /\b(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi;
const BASIC = /\b(Basic\s+)[A-Za-z0-9+/]{8,}=*/gi;
const FIELD = /\b((?:api[_-]?)?token|password|secret|authorization)(["']?\s*[:=]\s*["']?)([^\s"'&,}]{8,})/gi;

const secrets = new Set<string>();

/** Remembers a secret, such as a server's token, so it is masked from now on. Short and empty values are ignored. */
export function registerSecret(secret: string | undefined): void {
  const value = secret?.trim();
  if (value && value.length >= MIN_SECRET_LENGTH) secrets.add(value);
}

/** The text with every registered secret masked. Used for tool results, which must otherwise stay as they are. */
export function redactSecrets(text: string): string {
  let result = text;
  for (const secret of secrets) {
    if (result.includes(secret)) result = result.split(secret).join(REDACTED);
  }
  return result;
}

/** The text with registered secrets and credential-shaped fields (bearer and basic headers, token fields) masked. For logs. */
export function redactLogText(text: string): string {
  return redactSecrets(text)
    .replace(BEARER, `$1${REDACTED}`)
    .replace(BASIC, `$1${REDACTED}`)
    .replace(FIELD, `$1$2${REDACTED}`);
}

/** A token as people should see it: only its last four characters. */
export function maskToken(token: string | undefined): string {
  return token ? `••••${token.slice(-4)}` : '(not set)';
}

let stderrRedacted = false;

/** Masks credentials in everything written to stderr, by this code or by any library. Idempotent. */
export function redactStderr(): void {
  if (stderrRedacted) return;
  stderrRedacted = true;
  const write = process.stderr.write.bind(process.stderr) as (...args: unknown[]) => boolean;
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : undefined;
    return write(text === undefined ? chunk : redactLogText(text), ...rest);
  }) as typeof process.stderr.write;
}

/** For tests: forgets every registered secret. */
export function clearRegisteredSecrets(): void {
  secrets.clear();
}
