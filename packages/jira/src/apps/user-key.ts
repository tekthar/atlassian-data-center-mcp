import { MyselfService } from '../jira-client/index.js';
import { asRecord } from '../tools/context.js';

/** The Jira user key an app names people by: the one given, or the token's own user's. */
export async function userKeyOrMine(given: string | undefined): Promise<string> {
  if (given) return given;
  const key = asRecord(await MyselfService.getUser()).key;
  if (typeof key !== 'string' || !key) throw new Error('Could not read your Jira user key; name the person by their user key.');
  return key;
}
