import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { ConfigKey, ProductDefinition, ReadableSource, SourceId } from '../source.js';
import { getNonEmptyValue } from '../source.js';
import {
  DotenvFileCache,
  DotenvFileNotFoundError,
  type ParsedEnvironment,
} from './dotenv-file-cache.js';

export const ATLASSIAN_DC_MCP_CONFIG_FILE_ENV_VAR = 'ATLASSIAN_DC_MCP_CONFIG_FILE';

const PRODUCT_SETTING = /^(JIRA|CONFLUENCE|BITBUCKET)_/;

export type EnvFileDeps = {
  warn: (message: string) => void;
};

/*
 * A dotenv file named by ATLASSIAN_DC_MCP_CONFIG_FILE, which the MCP client's own configuration sets. A `.env`
 * in the working directory is never read: clients often start servers inside whatever project is open, so its
 * author could set the host while the token comes from the keychain, and the server would send the user's
 * token there at startup.
 */
export class EnvFileSource implements ReadableSource {
  readonly id: SourceId = 'env-file';
  readonly priority = 80;

  private cache = new DotenvFileCache();
  private readonly deps: EnvFileDeps;

  constructor(deps: Partial<EnvFileDeps> = {}) {
    this.deps = { warn: (message) => process.stderr.write(`${message}\n`), ...deps };
  }

  initialize(options?: { cwd?: string }): void {
    this.loadFile();
    if (!this.getExplicitFilePath()) this.noticeIgnoredDotenv(options?.cwd ?? process.cwd());
  }

  read(product: ProductDefinition, key: ConfigKey): string | undefined {
    const values = this.loadFile();
    return getNonEmptyValue(values[product.envVars[key]]);
  }

  describe(): string {
    return this.cache.filePath ? `env-file (${this.cache.filePath})` : 'env-file';
  }

  private getExplicitFilePath(): string | undefined {
    const filePath = getNonEmptyValue(process.env[ATLASSIAN_DC_MCP_CONFIG_FILE_ENV_VAR]);
    if (!filePath) {
      return undefined;
    }
    if (!path.isAbsolute(filePath)) {
      throw new Error(`${ATLASSIAN_DC_MCP_CONFIG_FILE_ENV_VAR} must be an absolute path: ${filePath}`);
    }
    return filePath;
  }

  private loadFile(): ParsedEnvironment {
    const filePath = this.getExplicitFilePath();
    if (!filePath) {
      return {};
    }
    try {
      return this.cache.load(filePath);
    } catch (error) {
      if (error instanceof DotenvFileNotFoundError) {
        throw new Error(`${ATLASSIAN_DC_MCP_CONFIG_FILE_ENV_VAR} points to a missing file: ${error.filePath}`);
      }
      throw error;
    }
  }

  /** Versions before 0.47.1 read `.env` in the working directory; say so once when such a file looks like ours. */
  private noticeIgnoredDotenv(cwd: string): void {
    const file = path.join(cwd, '.env');
    try {
      if (!Object.keys(dotenv.parse(fs.readFileSync(file))).some((key) => PRODUCT_SETTING.test(key))) return;
    } catch {
      return;
    }
    this.deps.warn(`Ignoring ${file}: settings are no longer read from a .env in the working directory. ` +
      `To use that file, set ${ATLASSIAN_DC_MCP_CONFIG_FILE_ENV_VAR} to its absolute path in your MCP client's configuration.`);
  }
}
