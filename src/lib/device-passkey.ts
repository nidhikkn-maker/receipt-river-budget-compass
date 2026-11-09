import { useServerFn } from "@tanstack/react-start";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { passkeyOptions, verifyPasskey } from "@/lib/passkeys.functions";
import { ensureStepUp, REGISTER_PASSKEY_ACTION } from "@/lib/step-up-check";

/**
 * Face ID / passkey register, unlock or step-up (re-confirmation for sensitive changes). The browser library loads only when used, keeping sign-in light.
 * Registering always needs a fresh re-confirmation first (passkey, account password or an emailed code; never the PIN);
 * where no confirmation dialog is mounted, registration is cancelled and nothing is saved.
 */
export function useDevicePasskey() {
  const options = useServerFn(passkeyOptions);
  const verify = useServerFn(verifyPasskey);
  return async (kind: "register" | "unlock" | "stepup") => {
    if (kind === "register") await ensureStepUp(REGISTER_PASSKEY_ACTION, { always: true });
    const res = await options({ data: { kind } });
    const { startAuthentication, startRegistration } = await import("@simplewebauthn/browser");
    const response = kind === "register"
      ? await startRegistration({ optionsJSON: JSON.parse(res.options) as PublicKeyCredentialCreationOptionsJSON })
      : await startAuthentication({ optionsJSON: JSON.parse(res.options) as PublicKeyCredentialRequestOptionsJSON });
    return verify({ data: { kind, response: response as unknown as Record<string, unknown> } });
  };
}
