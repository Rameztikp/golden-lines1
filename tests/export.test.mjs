import test from 'node:test';
import assert from 'node:assert/strict';
import {csvCell} from '../public/admin-utils.js';
test('CSV export quotes data and neutralizes formulas including leading whitespace',()=>{
 for(const value of ['=1+1','+cmd','-1+1','@SUM(A1)','  =1+1','\t=1+1','\r=1+1','\n=1+1'])assert.ok(csvCell(value).startsWith('"\''),JSON.stringify(value));
 assert.equal(csvCell('اسم، عربي'),'"اسم، عربي"');assert.equal(csvCell('a"b'),'"a""b"');assert.equal(csvCell(null),'""');assert.equal(csvCell('safe\ntext'),'"safe\ntext"');
});
