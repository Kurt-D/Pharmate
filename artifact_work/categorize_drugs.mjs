import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const sourcePath = 'C:/Users/Sandy Lorraine/Downloads/Drug Reference.xlsx';
const outputDir = 'C:/Users/Sandy Lorraine/Pharmate/outputs/drug-reference-categorized';
const sourceUrl = 'https://verification.fda.gov.ph/ALL_DrugProductslist.php';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const drugSheet = workbook.worksheets.getItem('Drug Reference');
const data = drugSheet.getRange('A3:L32').values;

const otc = new Set(['paracetamol', 'ibuprofen', 'mefenamic acid', 'cetirizine', 'loratadine', 'diphenhydramine', 'oral rehydration salts', 'loperamide']);
const officialOtcEvidence = new Set(['paracetamol', 'ibuprofen', 'loratadine']);
const classifications = data.map((row) => {
  const name = String(row[0] || '').trim().toLowerCase();
  const rxClass = otc.has(name) ? 'OTC' : 'RX';
  const evidence = officialOtcEvidence.has(name) ? 'PH FDA product evidence found' : 'Conservative clinical classification';
  const note = officialOtcEvidence.has(name)
    ? 'Current Philippine FDA registry includes OTC presentation(s); classification remains product-specific.'
    : rxClass === 'RX'
      ? 'Prescription required by default; pharmacist must confirm the exact Philippine product, strength, and dosage form.'
      : 'Common non-prescription presentation; pharmacist must confirm the exact Philippine product, strength, and dosage form.';
  return [rxClass, 'PHARMACIST REVIEW', evidence, note, sourceUrl];
});

drugSheet.mergeCells('M1:Q1');
drugSheet.getRange('M1').values = [['Regulatory Classification (Philippines)']];
drugSheet.getRange('M2:Q2').values = [['rx_class', 'approval_status', 'classification_basis', 'classification_note', 'source_url']];
drugSheet.getRange('M3:Q32').values = classifications;
drugSheet.getRange('M1:Q1').format = { fill: '#174EA6', font: { bold: true, color: '#FFFFFF', size: 13 }, horizontalAlignment: 'center', verticalAlignment: 'center' };
drugSheet.getRange('M2:Q2').format = { fill: '#DCE6F1', font: { bold: true, color: '#17365D' }, wrapText: true, borders: { preset: 'outside', style: 'thin', color: '#9FBAD0' } };
drugSheet.getRange('M3:Q32').format = { verticalAlignment: 'top', wrapText: true };
drugSheet.getRange('M3:M32').conditionalFormats.add('containsText', { text: 'OTC', format: { fill: '#E2F0D9', font: { color: '#236B2D', bold: true } } });
drugSheet.getRange('M3:M32').conditionalFormats.add('containsText', { text: 'RX', format: { fill: '#FCE4D6', font: { color: '#9C2F00', bold: true } } });
drugSheet.getRange('N3:N32').conditionalFormats.add('containsText', { text: 'REVIEW', format: { fill: '#FFF2CC', font: { color: '#7F6000', bold: true } } });
for (const [column, width] of [['M:M',14],['N:N',20],['O:O',28],['P:P',55],['Q:Q',42]]) drugSheet.getRange(column).format.columnWidth = width;
drugSheet.freezePanes.freezeRows(2);
drugSheet.showGridLines = false;

const summary = workbook.worksheets.add('Classification Summary');
summary.showGridLines = false;
summary.getRange('A1:F1').merge();
summary.getRange('A1').values = [['Drug Reference — RX / OTC Classification Review']];
summary.getRange('A1:F1').format = { fill: '#174EA6', font: { bold: true, color: '#FFFFFF', size: 16 }, horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 30 };
summary.getRange('A3:B6').values = [['Metric', 'Count'], ['Total medicine rows', null], ['Suggested RX', null], ['Suggested OTC', null]];
summary.getRange('B4').formulas = [["=COUNTA('Drug Reference'!$A$3:$A$32)"]];
summary.getRange('B5').formulas = [["=COUNTIF('Drug Reference'!$M$3:$M$32,\"RX\")"]];
summary.getRange('B6').formulas = [["=COUNTIF('Drug Reference'!$M$3:$M$32,\"OTC\")"]];
summary.getRange('A3:B3').format = { fill: '#DCE6F1', font: { bold: true, color: '#17365D' } };
summary.getRange('A3:B6').format.borders = { preset: 'outside', style: 'thin', color: '#9FBAD0' };
summary.getRange('A8:F8').values = [['Status', 'Meaning', 'RX behavior', 'OTC behavior', 'Required reviewer', 'Authoritative source']];
summary.getRange('A9:F9').values = [['PHARMACIST REVIEW', 'Suggested class only; verified_by and date_approved are blank.', 'Require prescription upload and two-stage validation.', 'Allow only after exact product/formulation confirmation.', 'Licensed pharmacist', sourceUrl]];
summary.getRange('A8:F8').format = { fill: '#DCE6F1', font: { bold: true, color: '#17365D' }, wrapText: true };
summary.getRange('A9:F9').format = { fill: '#FFF2CC', wrapText: true, verticalAlignment: 'top' };
summary.getRange('A11:F11').merge();
summary.getRange('A11').values = [['Important: Philippine FDA classification is product-specific. The same generic ingredient can have OTC and RX presentations depending on strength, dosage form, and registration.']];
summary.getRange('A11:F11').format = { fill: '#FCE4D6', font: { color: '#9C2F00', bold: true }, wrapText: true, rowHeight: 42 };
for (const [column, width] of [['A:A',22],['B:B',42],['C:D',38],['E:E',22],['F:F',48]]) summary.getRange(column).format.columnWidth = width;
summary.freezePanes.freezeRows(1);

await fs.mkdir(outputDir, { recursive: true });
for (const [sheetName, range, file, scale] of [['Drug Reference','A1:Q32','drug-reference-preview.png',1],['Classification Summary','A1:F11','summary-preview.png',1.5]]) {
  const preview = await workbook.render({ sheetName, range, scale, format: 'png' });
  await fs.writeFile(`${outputDir}/${file}`, new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/Drug Reference - Categorized.xlsx`);
await fs.writeFile(`${outputDir}/drug-reference-import.json`, JSON.stringify(data.map((row, index) => ({
  generic_name: String(row[0] || '').trim(),
  brand_names: String(row[1] || '').split(',').map((value) => value.trim()).filter(Boolean),
  standard_frequency: row[2] ?? null,
  min_interval_hours: row[3] ?? null,
  meal_instruction: row[4] ?? null,
  max_daily_doses: row[5] ?? null,
  is_prn_default: /^yes$/i.test(String(row[6] || '')),
  default_interval_hours: row[7] ?? null,
  meal_anchor_code: row[8] || 'NONE',
  notes: row[9] ?? null,
  rx_class: classifications[index][0],
  approval_status: classifications[index][1],
})), null, 2));
console.log((await workbook.inspect({ kind: 'table', sheetId: 'Classification Summary', range: 'A1:F11', include: 'values,formulas', tableMaxRows: 15, tableMaxCols: 8, maxChars: 10000 })).ndjson);
console.log((await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 100 }, summary: 'formula errors' })).ndjson);
