import * as XLSX from 'xlsx';

export function exportToExcel(data: any[], filename: string, sheetName: string = 'Sayfa1') {
  if (!data || data.length === 0) {
    alert('Dışa aktarılacak veri bulunamadı.');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, finalName);
}
