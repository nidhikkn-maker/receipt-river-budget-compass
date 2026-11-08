import { zipSync,strToU8 } from 'fflate';
import { fetchPrivateFile,sha256Hex } from '../private-files';
import { toCsv,toExcel,toPdf } from '../reports';
import { corporateReport,CORPORATE_TYPES,type CorporateWorking } from './corporate-statements';
import type { VaultDoc } from '../documents';

/** All-or-nothing bundle from frozen working; private originals recheck current access. */
export async function corporateAuditPack(w:CorporateWorking,visible:VaultDoc[],sign:(path:string)=>Promise<string|null>,fetcher:typeof fetch=fetch):Promise<Blob>{
 const files:Record<string,Uint8Array>={};
 const hashes:{path:string;zipPath:string;sha256:string;size:number}[]=[];
 const paths=[...new Set(w.lines.flatMap(l=>l.originalPaths))];
 for(const [index,path] of paths.entries()){
   const url=await sign(path);if(!url)throw Error('An original document is unavailable or access has ended. No incomplete audit pack was downloaded.');
   const doc=visible.find(d=>d.filePath===path);
   const blob=await fetchPrivateFile(url,{size:doc?.size,mimeType:doc?.mimeType},fetcher);
   const bytes=await blob.arrayBuffer(),zipPath=`originals/${String(index+1).padStart(4,'0')}-${(doc?.fileName??path.split('/').pop()??'original').replace(/[^\w.\-]+/g,'_')}`;
   files[zipPath]=new Uint8Array(bytes);hashes.push({path,zipPath,sha256:await sha256Hex(bytes),size:bytes.byteLength});
 }
 for(const type of CORPORATE_TYPES){
  const r=corporateReport(w,type);files[`${type}.csv`]=strToU8(toCsv(r));files[`${type}.xlsx`]=new Uint8Array(await (await toExcel(r)).arrayBuffer());
  files[`${type}.pdf`]=new Uint8Array(await (await toPdf(r,`${w.from} to ${w.to} · Working accounts; ${w.issues.length} unresolved checks`)).arrayBuffer());
 }
 files['accounting-evidence.json']=strToU8(JSON.stringify({version:1,working:w,originals:hashes},null,2));
 files['unresolved-checks.csv']=strToU8(toCsv({title:'Unresolved checks',headers:['Record ID','Check'],rows:w.issues.map(i=>[i.recordId,i.message])}));
 return new Blob([new Uint8Array(zipSync(files))],{type:'application/zip'});
}