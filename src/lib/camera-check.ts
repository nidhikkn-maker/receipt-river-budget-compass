/* Returns a plain reason when this device can't open its camera for receipt scanning, otherwise null.
   Unknown answers (browsers without these checks) return null so the camera is still tried. */
export async function cameraBlocked(): Promise<string | null> {
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      const st = await perms.query({ name: "camera" as PermissionName }).catch(() => null);
      if (st?.state === "denied") return "Camera access is turned off for Ledgerline";
    }
    if (navigator.mediaDevices?.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (devices.length && !devices.some((d) => d.kind === "videoinput")) return "No camera found on this device";
    }
  } catch { /* unknown: let the camera try */ }
  return null;
}
