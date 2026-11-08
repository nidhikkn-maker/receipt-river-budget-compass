import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { DocumentIntake } from "../../src/components/DocumentIntake";
import { Button } from "../../src/components/ui/button";
import { Toaster } from "../../src/components/ui/sonner";
import { state } from "./asset-document-mocks";
import { annualBook } from "../../src/lib/books/depreciation";
import { taxSchedule, type Asset } from "../../src/lib/assets";
import "../../src/styles.css";
function Fixture() {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState(state());
  const asset = records.preferences.assets[0] as Asset | undefined;
  return <main className="mx-auto max-w-3xl space-y-4 p-4"><input type="file" aria-label="Maintenance original" onChange={e => setFile(e.target.files?.[0] ?? null)} />{file && <DocumentIntake file={file} context={location.search.includes('invoice')?'assets':undefined} onClose={() => setFile(null)} />}<Button onClick={() => setRecords(state())}>Read saved asset</Button>{asset && <output aria-label="Saved asset figures">Assets {records.preferences.assets.length} · Cost {asset.cost} · Book {annualBook(asset, "2026-27").nbv} · Tax {taxSchedule(asset, "2026-27")[0]?.closing} · Documents {records.documents.length}</output>}<Toaster /></main>;
}
const rootRoute = createRootRoute({ component: Fixture });
const router = createRouter({ routeTree: rootRoute });
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);