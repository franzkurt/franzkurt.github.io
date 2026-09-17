/**
 * XLSXUtils — XLSX ↔ CSV ↔ JSON conversion.
 *
 * CDN dep:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
 */
class XLSXUtils {
  static readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(new Uint8Array(e.target.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  static parseWorkbook(data) {
    return XLSX.read(data, { type: 'array' });
  }

  static sheetToJSON(workbook, sheetName = null) {
    const name = sheetName || workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
  }

  static sheetToCSV(workbook, sheetName = null) {
    const name = sheetName || workbook.SheetNames[0];
    return XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
  }

  static async xlsxToJSON(file, sheetName = null) {
    const data = await this.readFile(file);
    return this.sheetToJSON(this.parseWorkbook(data), sheetName);
  }

  static async xlsxToCSV(file, sheetName = null) {
    const data = await this.readFile(file);
    return this.sheetToCSV(this.parseWorkbook(data), sheetName);
  }

  static csvToJSON(csvText, delimiter = ',') {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const obj = {};
      const matches = line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g) || [];
      headers.forEach((h, i) => {
        let val = matches[i] ? matches[i].replace(/,$/, '').trim() : '';
        val = val.replace(/^"|"$/g, '').replace(/""/g, '"');
        obj[h] = val;
      });
      return obj;
    });
  }

  static jsonToCSV(jsonArray, opts = {}) {
    if (!jsonArray.length) return '';
    const { delimiter = ',', headers = null } = opts;
    const cols = headers || Object.keys(jsonArray[0]);
    const escape = (v) => {
      const s = String(v ?? '');
      if (s.includes(delimiter) || s.includes('"') || s.includes('\n'))
        return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const rows = [cols.join(delimiter)];
    jsonArray.forEach(obj => rows.push(cols.map(c => escape(obj[c])).join(delimiter)));
    return rows.join('\n');
  }

  static jsonToXLSX(jsonArray, sheetName = 'Sheet1') {
    const ws = XLSX.utils.json_to_sheet(jsonArray);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  }

  static csvToXLSX(csvText, sheetName = 'Sheet1') {
    return this.jsonToXLSX(this.csvToJSON(csvText), sheetName);
  }

  static downloadXLSX(buffer, filename = 'planilha.xlsx') {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
}
