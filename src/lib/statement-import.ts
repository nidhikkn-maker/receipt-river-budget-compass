import { normalizeDate, parseStatementCsv, type StatementLine } from "./expenses";
export async function readStatement(file: File): Promise<StatementLine[]> {
 if(file.size>15*1024*1024)throw Error("Statement must be under 15 MB");
 if(/\.csv$/i.test(file.name)) return parseStatementCsv(await file.text());
 if(/\.xlsx$/i.test(file.name)) {
  const {default:read}=await import("read-excel-file/browser");
  const rows=await read(file);const csv=rows.map(row=>row.map(cell=>`"${(cell instanceof Date?cell.toISOString().slice(0,10):String(cell??"")).replaceAll('"','""')}"`).join(",")).join("\n");
  return parseStatementCsv(csv);
 }
 if(/\.pdf$/i.test(file.name)) {
  const pdfjs=await import("pdfjs-dist");
  const worker=await import("pdfjs-dist/build/pdf.worker.min.mjs?url");pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  const doc=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  try {const rows:string[]=[];for(let n=1;n<=Math.min(doc.numPages,50);n++){const page=await doc.getPage(n);const content=await page.getTextContent();let line="";let y:number|undefined;for(const item of content.items){if(!("str" in item))continue;const cy=item.transform[5];if(y!==undefined&&Math.abs(cy-y)>3){rows.push(line);line="";}line+=`${item.str} `;y=cy;if(item.hasEOL){rows.push(line);line="";y=undefined;}}if(line)rows.push(line);}
  const result=rows.flatMap((row,i)=>{const m=row.match(/^\s*(\d{2}[/.\-]\d{2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s*(?:DR)?\s*$/i);if(!m)return [];const date=normalizeDate(m[1]??"");const amount=Number((m[3]??"").replaceAll(",",""));return date&&amount>0?[{ref:`P${i}`,date,description:m[2]??"",amount}]:[];});
  if(!result.length)throw Error("This PDF layout needs a CSV or Excel export. Scanned PDFs are not supported.");return result;
  }finally{await doc.destroy();}
 }
 throw Error("Choose CSV, XLSX or a text PDF statement");
}
