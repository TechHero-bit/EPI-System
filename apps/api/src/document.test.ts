import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { renderPdf, renderXlsx, type SheetSnapshot } from './document.js';

const snapshot: SheetSnapshot = {
  employee: { name:'João da Silva',registration:'42',jobTitle:'Técnico',department:'Manutenção',admissionDate:'2026-10-01',terminationDate:null },
  issuedAt:'2026-10-19T12:00:00.000Z',documentDate:'2026-10-19',method:'MANUAL',template:'PROVISIONAL_FROM_IMAGE_V1',
  items:[{date:'2026-10-19',description:'PAR DE BOTAS DE PROTEÇÃO',ca:'27300',brand:'BRACOL',risk:'02',size:'39',lot:'L-001',variantId:'v',lotId:'l',quantity:1}]
};

test('gera PDF legível e Excel com o mesmo item unitário', async () => {
  const pdf = await renderPdf(snapshot);
  const parsed = await PDFDocument.load(pdf);
  assert.equal(parsed.getPageCount(),1);
  assert.ok(pdf.byteLength > 1000);
  const excel = await renderXlsx(snapshot);
  assert.equal(excel.subarray(0,2).toString(),'PK');
  assert.ok(excel.byteLength > 1000);
});
