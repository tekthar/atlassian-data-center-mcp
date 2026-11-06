import type { CredentialValidationContext, ValidateCredentials } from './setup-cli.js';
import { describeValidationError } from './setup/describe-error.js';

/** A service that can check its configuration with one request, returning who the token signs in as when it knows. */
export interface ValidatableService {
  validateSetup(): Promise<string | undefined | void>;
}

/** The credential check `setup` and `doctor` share: builds the product's service from the settings and calls it once. */
export function credentialValidator(createService: (context: CredentialValidationContext) => ValidatableService): ValidateCredentials {
  return async (context) => {
    try {
      const user = await createService(context).validateSetup();
      return user ? { ok: true, detail: `signed in as ${user}` } : { ok: true };
    } catch (error) {
      return { ok: false, message: describeValidationError(error) };
    }
  };
}
