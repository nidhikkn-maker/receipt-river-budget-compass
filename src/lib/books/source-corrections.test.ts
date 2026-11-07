import { it, expect } from 'vitest';
import { correctSourceField } from './source-corrections';
import type { ExtractedDocument } from '../document-extract.functions';
import type { DocField } from '../documents';
const read = { asset: { cost: 1000, name: 'Computer' }, lease: { rent: 10000 } } as unknown as ExtractedDocument;
const field=(label:string,value:string):DocField=>({label,value,originalValue:value,page:1,quote:value,confidence:'low',status:'read'});
it('correcting purchase cost refreshes the asset proposal and keeps printed source intact',()=>{
 const result=correctSourceField(read,field('Purchase cost','1000'),'1,250');expect(result.read.asset?.cost).toBe(1250);expect(result.field.originalValue).toBe('1000');expect(result.field.status).toBe('corrected');expect(read.asset?.cost).toBe(1000);
});
it('lease correction updates monthly rent, not an unrelated asset amount',()=>{const r=correctSourceField(read,field('Monthly rent','10000'),'12000');expect(r.read.lease?.rent).toBe(12000);expect(r.read.asset?.cost).toBe(1000);});
it('ambiguous Amount remains a detail and never silently changes money',()=>{const r=correctSourceField(read,field('Amount','1000'),'9999');expect(r.applied).toBe(false);expect(r.read).toBe(read);});
it('negative or nonnumeric corrected financial values are refused',()=>{expect(()=>correctSourceField(read,field('Purchase cost','1000'),'-1')).toThrow(/non-negative/);expect(()=>correctSourceField(read,field('Purchase cost','1000'),'money')).toThrow(/non-negative/);});
it('later corrections preserve the first printed value',()=>{const a=correctSourceField(read,field('Purchase cost','1000'),'1250');const b=correctSourceField(a.read,a.field,'1300');expect(b.read.asset?.cost).toBe(1300);expect(b.field.originalValue).toBe('1000');});