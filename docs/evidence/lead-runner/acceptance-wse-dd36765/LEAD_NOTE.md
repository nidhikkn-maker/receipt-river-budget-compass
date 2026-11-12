# Lead note — WS-E dd36765 (ws/e-records-next14)
Runner: ACCEPTED 3 x 4,020/4,020 (tree 633f7a72, unchanged).
Lead verdict: NOT_ACCEPTED on independent review (2026-11-11T17:20Z).
Medium, confirmed by lead reading code:
- M1 offline writes reachable: AssetTransferForm (savePreferences, no online check in store.tsx), CompanyTaxProfile Save/Delete/Copy/Add enabled offline, AssetBooks lifecycle putAsset offline.
- M2 disposal ConfirmDialog stays actionable after going offline (requestAssetDisposal).
- M3 offline sweep blind to clicks, device-copy subtrees, storage/functions/server-fn calls.
Plus lows (reconnect double read, denied wording, provisional "Not linked", cosmetic). Routed to WS-E for next freeze.
