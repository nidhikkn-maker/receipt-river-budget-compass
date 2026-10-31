import { normalizeDate, parseStatementCsv, type StatementLine } from "./expenses";
export async function readStatement(file: Pick<File, "size" | "name" | "text" | "arrayBuffer">): Promise<StatementLine[]> {
 if(file.size>15*1024*1024)throw Error("Statement must be under 15 MB");
 if(/\.csv$/i.test(file.name)) return parseStatementCsv(await file.text(),true);
 if(/\.xlsx?$/i.test(file.name)) {
  const {read,utils}=await import("xlsx");
  const workbook=read(new Uint8Array(await file.arrayBuffer()),{type:"array",cellDates:true});
  for(const name of workbook.SheetNames){
   const sheet=workbook.Sheets[name];if(!sheet)continue;
   const rows=utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",raw:true});
   // Bank exports may start with an account summary or have a cover worksheet.
   const header=rows.findIndex(row=>row.some(c=>/date/i.test(String(c)))&&row.some(c=>/debit|withdrawal|amount|value|paid out/i.test(String(c))));
   if(header<0)continue;
   const csv=rows.slice(header).map(row=>row.map(cell=>`"${(cell instanceof Date?cell.toISOString().slice(0,10):String(cell??"")).replaceAll('"','""')}"`).join(",")).join("\n");
   const lines=parseStatementCsv(csv,true);if(lines.length)return lines;
  }
  throw Error("No transactions found in this workbook. Check the date, description and debit/credit columns.");
 }
 if(/\.pdf$/i.test(file.name)) {
  const pdfjs=await import("pdfjs-dist");
  const worker=await import("pdfjs-dist/build/pdf.worker.min.mjs?url");pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  const task=pdfjs.getDocument({data:await file.arrayBuffer()});const doc=await task.promise;
  try {const rows:string[]=[];for(let n=1;n<=Math.min(doc.numPages,50);n++){const page=await doc.getPage(n);const content=await page.getTextContent();let line="";let y:number|undefined;for(const item of content.items){if(!("str" in item))continue;const cy=item.transform[5];if(y!==undefined&&Math.abs(cy-y)>3){rows.push(line);line="";}line+=`${item.str} `;y=cy;if(item.hasEOL){rows.push(line);line="";y=undefined;}}if(line)rows.push(line);}
  const result=rows.flatMap((row,i)=>{const m=row.match(/^\s*(\d{2}[/.\-]\d{2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s*(?:DR)?\s*$/i);if(!m)return [];const date=normalizeDate(m[1]??"");const amount=Number((m[3]??"").replaceAll(",",""));return date&&amount>0?[{ref:`P${i}`,date,description:m[2]??"",amount}]:[];});
  if(!result.length)throw Error("This PDF layout needs a CSV or Excel export. Scanned PDFs are not supported.");return result;
  }finally{await task.destroy();}
 }
 throw Error("Choose CSV, XLS, XLSX or a PDF statement");
}
