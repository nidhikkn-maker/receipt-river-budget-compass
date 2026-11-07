import { useServerFn } from "@tanstack/react-start";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { passkeyOptions, verifyPasskey } from "@/lib/passkeys.functions";

/** Face ID / passkey register or unlock. The browser library loads only when used, keeping sign-in light. */
export function useDevicePasskey() {
  const options = useServerFn(passkeyOptions);
  const verify = useServerFn(verifyPasskey);
  return async (kind: "register" | "unlock") => {
    const res = await options({ data: { kind } });
    const { startAuthentication, startRegistration } = await import("@simplewebauthn/browser");
    const response = kind === "register"
      ? await startRegistration({ optionsJSON: JSON.parse(res.options) as PublicKeyCredentialCreationOptionsJSON })
      : await startAuthentication({ optionsJSON: JSON.parse(res.options) as PublicKeyCredentialRequestOptionsJSON });
    await verify({ data: { kind, response: response as unknown as Record<string, unknown> } });
  };
}
