import { zipSync, strToU8 } from 'fflate';
import { fetchPrivateFile } from '../private-files';
import type { VaultDoc } from '../documents';
import type { DocLink } from './types';
import { exportManifest } from './docrepo';

/** Build only after every selected, currently visible original passes its integrity check. */
export async function selectedDocumentZip(visible: VaultDoc[], picked: string[], links: DocLink[], at: string, sign: (path: string) => Promise<string | null>, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const ids = [...new Set(picked)];
  const chosen = ids.map(id => visible.find(d => d.id === id));
  if (!ids.length || chosen.some(d => !d)) throw Error('One or more selected documents are no longer available. Review the selection.');
  const docs = chosen.filter((d): d is VaultDoc => !!d);
  const files: Record<string, Uint8Array> = {};
  for (const d of docs) {
    const url = await sign(d.filePath);
    if (!url) throw Error(`Access to ${d.fileName} has ended`);
    const blob = await fetchPrivateFile(url, { size: d.size, mimeType: d.mimeType }, fetcher);
    files[`${d.id}-${d.fileName.replace(/[^\w.\- ]+/g, '_')}`] = new Uint8Array(await blob.arrayBuffer());
  }
  files['manifest.json'] = strToU8(JSON.stringify(exportManifest(docs, links, at), null, 2));
  return zipSync(files);
}