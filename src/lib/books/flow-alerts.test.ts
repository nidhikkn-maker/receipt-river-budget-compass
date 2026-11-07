import { it, expect } from 'vitest';
import { valuationAlerts } from './market';
import { DEFAULT_ALERTS, type Snapshot } from './types';
const snapshot=(date:string,portfolio:number,flows:number,invested:number):Snapshot=>({date,portfolio,flows,invested,netWorth:portfolio,liquid:0,liabilities:0,allocation:{}});
it('a withdrawal does not trigger a false market loss despite unchanged acquisition cost',()=>{
 expect(valuationAlerts([], [snapshot('2026-11-01',1000,0,1000),snapshot('2026-11-02',800,-200,1000)],DEFAULT_ALERTS,{})).toEqual([]);
});
it('a contribution does not mask an actual market loss',()=>{
 const result=valuationAlerts([], [snapshot('2026-11-01',1000,0,1000),snapshot('2026-11-02',1100,200,1200)],DEFAULT_ALERTS,{});
 expect(result[0]).toMatch(/fell 10\.0%/);
});