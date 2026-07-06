'use strict';

// GENERATED from index.html by tools/build-package.js — DO NOT EDIT.
// The browser tool is the source of truth; this file is byte-identical
// engine code, wrapped as a factory so the host supplies the two
// browser APIs the engine touches (window.jsyaml and DOMParser).

module.exports = function createEngine(window, DOMParser) {
// PARSERS — format text → JS value (intermediate representation)
// ============================================================

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (strictErr) {
    // Retry as JSONC: strip comments and trailing commas, then parse
    // strictly. If it still fails, surface the original strict error.
    try {
      return JSON.parse(stripJsonc(text));
    } catch (e) {
      throw strictErr;
    }
  }
}

function stripJsonc(text) {
  let out = '';
  let i = 0;
  let inStr = false;
  const skipComment = j => {
    if (text[j] === '/' && text[j + 1] === '/') {
      while (j < text.length && text[j] !== '\n') j++;
      return j;
    }
    if (text[j] === '/' && text[j + 1] === '*') {
      j += 2;
      while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
      return j + 2;
    }
    return j;
  };
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\' && i + 1 < text.length) { out += text[i + 1]; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    const skipped = skipComment(i);
    if (skipped !== i) { i = skipped; continue; }
    if (c === ',') {
      // Trailing comma: drop it if the next meaningful char closes a container
      let j = i + 1;
      while (j < text.length) {
        if (/\s/.test(text[j])) { j++; continue; }
        const s = skipComment(j);
        if (s !== j) { j = s; continue; }
        break;
      }
      if (text[j] === '}' || text[j] === ']') { i++; continue; }
    }
    out += c;
    i++;
  }
  return out;
}

function parseNdjson(text) {
  const values = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try {
      values.push(JSON.parse(lines[i]));
    } catch (e) {
      throw new Error('NDJSON line ' + (i + 1) + ': ' + e.message);
    }
  }
  return values;
}

function parseYaml(text) {
  return window.jsyaml.load(text);
}

// Shared string → number/boolean sniffing for the tabular parsers.
// Skipped entirely when opts.coerceTypes === false (input-side UI toggle).
function coerceScalar(text, opts) {
  if (opts && opts.coerceTypes === false) return text;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+$/.test(text)) return parseInt(text);
  if (/^-?\d*\.\d+$/.test(text)) return parseFloat(text);
  return text;
}

function parseDelimited(text, delimiter, opts) {
  const strict = !!(opts && opts.strictParse);
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++;
    } else {
      if (c === '"' && field === '') { inQuotes = true; i++; continue; }
      if (c === delimiter) { current.push(field); field = ''; i++; continue; }
      if (c === '\n' || c === '\r') {
        current.push(field); field = '';
        if (current.length > 1 || current[0] !== '') rows.push(current);
        current = [];
        if (c === '\r' && text[i + 1] === '\n') i += 2;
        else i++;
        continue;
      }
      field += c; i++;
    }
  }
  if (inQuotes && strict) throw new Error('unterminated quoted field');
  if (field !== '' || current.length > 0) {
    current.push(field);
    if (current.length > 1 || current[0] !== '') rows.push(current);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    if (strict && rows[r].length !== header.length) {
      throw new Error(`row ${r + 1} has ${rows[r].length} field${rows[r].length === 1 ? '' : 's'}, expected ${header.length}`);
    }
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = coerceScalar(rows[r][c] ?? '', opts);
    }
    records.push(obj);
  }
  return records;
}

const CSV_DELIMITERS = { comma: ',', semicolon: ';', pipe: '|', tab: '\t' };
function csvDelimiter(name) { return CSV_DELIMITERS[name] || ','; }

function parseCsv(text, opts) { return parseDelimited(text, csvDelimiter(opts && opts.csvDelimiterIn), opts); }
function parseTsv(text, opts) { return parseDelimited(text, '\t', opts); }

function parseXml(text, opts) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid XML: ' + parseError.textContent.slice(0, 100));
  const root = doc.documentElement;
  // If an attribute-less root has repeated children with the same tag,
  // treat it as an array of records
  const children = [...root.children];
  const rootAttrs = root.attributes ? root.attributes.length : 0;
  if (children.length > 0 && rootAttrs === 0 && children.every(c => c.tagName === children[0].tagName)) {
    // Array of records
    return children.map(c => xmlNodeToObject(c, opts));
  }
  return xmlNodeToObject(root, opts);
}

function coerceXmlText(text, opts) {
  if (opts && opts.coerceTypes === false) return text;
  if (text === 'null') return null;
  return coerceScalar(text, opts);
}

function xmlNodeToObject(node, opts) {
  const children = [...node.children];
  const obj = {};
  // Attributes become @-prefixed keys (XSLT-style convention)
  const attrs = node.attributes || [];
  for (let i = 0; i < attrs.length; i++) {
    obj['@' + attrs[i].name] = coerceXmlText(attrs[i].value, opts);
  }
  if (children.length === 0) {
    const text = node.textContent.trim();
    if (Object.keys(obj).length === 0) return coerceXmlText(text, opts);
    if (text !== '') obj['#text'] = coerceXmlText(text, opts);
    return obj;
  }
  for (const child of children) {
    const val = xmlNodeToObject(child, opts);
    if (child.tagName in obj) {
      if (!Array.isArray(obj[child.tagName])) obj[child.tagName] = [obj[child.tagName]];
      obj[child.tagName].push(val);
    } else {
      obj[child.tagName] = val;
    }
  }
  return obj;
}

function parseMarkdownTable(text, opts) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseCells = line => {
    // Split on pipes, but keep backslash-escaped pipes inside cells
    const raw = [];
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\' && line[i + 1] === '|') { cell += '\\|'; i++; continue; }
      if (line[i] === '|') { raw.push(cell); cell = ''; continue; }
      cell += line[i];
    }
    raw.push(cell);
    const slice = raw.slice(
      raw[0].trim() === '' ? 1 : 0,
      raw[raw.length - 1].trim() === '' ? -1 : raw.length
    );
    return slice.map(s => s.trim().replace(/\\\|/g, '|').replace(/<br>/gi, '\n'));
  };
  const header = parseCells(lines[0]);
  // lines[1] is the separator
  const strict = !!(opts && opts.strictParse);
  const records = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = parseCells(lines[i]);
    if (strict && cells.length !== header.length) {
      throw new Error(`table row ${i + 1} has ${cells.length} cell${cells.length === 1 ? '' : 's'}, expected ${header.length}`);
    }
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = coerceScalar(cells[c] ?? '', opts);
    }
    records.push(obj);
  }
  return records;
}

function parseHtmlTable(text, opts) {
  const parser = new DOMParser();
  const doc = parser.parseFromString('<!DOCTYPE html><html><body>' + text + '</body></html>', 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('No <table> element found');
  const rows = [...table.querySelectorAll('tr')].map(tr =>
    [...tr.children].map(td => td.textContent.trim())
  );
  if (rows.length === 0) return [];
  const header = rows[0];
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = coerceScalar(rows[r][c] ?? '', opts);
    }
    records.push(obj);
  }
  return records;
}

function parseSqlInsert(text, opts) {
  const m = text.match(/INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+)$/i);
  if (!m) throw new Error('Could not parse — expected: INSERT INTO table (cols) VALUES (vals), ...;');
  const cols = m[2].split(',').map(s => s.trim().replace(/^[`"']|[`"']$/g, ''));
  const valuesBlob = m[3].replace(/;\s*$/, '');
  const tuples = [];
  let i = 0, depth = 0, inStr = false, strCh = null, cur = '';
  while (i < valuesBlob.length) {
    const c = valuesBlob[i];
    if (inStr) {
      cur += c;
      if (c === '\\' && i + 1 < valuesBlob.length) { cur += valuesBlob[i+1]; i += 2; continue; }
      if (c === strCh) inStr = false;
      i++;
    } else {
      if (c === "'" || c === '"') { inStr = true; strCh = c; cur += c; i++; continue; }
      if (c === '(') { depth++; if (depth === 1) { cur = ''; i++; continue; } }
      if (c === ')') { depth--; if (depth === 0) { tuples.push(cur); cur = ''; i++; continue; } }
      if (depth > 0) cur += c;
      i++;
    }
  }
  const records = [];
  for (const t of tuples) {
    const vals = splitSqlValues(t, opts);
    const obj = {};
    for (let c = 0; c < cols.length; c++) obj[cols[c]] = vals[c] ?? null;
    records.push(obj);
  }
  return records;
}

function splitSqlValues(s, opts) {
  const out = [];
  let cur = '', inStr = false, strCh = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\' && i + 1 < s.length) { cur += c + s[i+1]; i++; continue; }
      if (c === strCh) inStr = false;
      cur += c;
    } else {
      if (c === "'" || c === '"') { inStr = true; strCh = c; cur += c; continue; }
      if (c === ',') { out.push(parseSqlValue(cur.trim(), opts)); cur = ''; continue; }
      cur += c;
    }
  }
  if (cur.trim() !== '') out.push(parseSqlValue(cur.trim(), opts));
  return out;
}

function parseSqlValue(v, opts) {
  // NULL and quote handling are SQL structure, not type sniffing —
  // they apply regardless of the coerce-types toggle.
  if (v === 'NULL' || v === 'null') return null;
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'");
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/""/g, '"');
  if (!opts || opts.coerceTypes !== false) {
    if (/^-?\d+$/.test(v)) return parseInt(v);
    if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
    if (v === 'true' || v === 'TRUE') return true;
    if (v === 'false' || v === 'FALSE') return false;
  }
  return v;
}

function parseIni(text, opts) {
  const root = {};
  let current = root;
  const lines = text.split(/\r?\n/);
  let lineNo = 0;
  const err = msg => { throw new Error(`INI line ${lineNo}: ${msg}`); };

  for (const rawLine of lines) {
    lineNo++;
    const line = rawLine.trim();
    if (!line) continue;
    // Full-line comments only — values legitimately contain ; and #
    if (line[0] === ';' || line[0] === '#') continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      const pathStr = line.slice(1, -1).trim();
      if (!pathStr) err('empty section header');
      const path = pathStr.split('.').map(s => s.trim());
      if (path.some(s => !s)) err(`invalid section header [${pathStr}]`);
      let node = root;
      for (const seg of path) {
        if (!(seg in node)) node[seg] = {};
        else if (node[seg] === null || typeof node[seg] !== 'object' || Array.isArray(node[seg])) {
          err(`[${pathStr}] conflicts with an existing non-section value`);
        }
        node = node[seg];
      }
      current = node;
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) err('expected "key = value" or "[section]"');
    const key = line.slice(0, eqIdx).trim();
    if (!key) err('empty key');
    if (key in current) err(`duplicate key "${key}"`);
    const valRaw = line.slice(eqIdx + 1).trim();
    if (valRaw.length >= 2 && valRaw[0] === '"' && valRaw[valRaw.length - 1] === '"') {
      current[key] = iniUnquote(valRaw, err);
    } else {
      current[key] = coerceScalar(valRaw, opts);
    }
  }
  return root;
}

function iniUnquote(raw, err) {
  let out = '';
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (c === '\\') {
      const n = raw[++i];
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === '"') out += '"';
      else if (n === '\\') out += '\\';
      else if (n === undefined) err('dangling backslash in quoted value');
      else out += n;
    } else out += c;
  }
  return out;
}

function parseProperties(text, opts) {
  const records = {};
  const physical = text.split(/\r?\n/);
  const logical = [];
  for (let i = 0; i < physical.length; i++) {
    let line = physical[i];
    const no = i + 1;
    while (propHasContinuation(line) && i + 1 < physical.length) {
      line = line.slice(0, -1) + physical[++i].replace(/^[ \t]+/, '');
    }
    logical.push({ line, no });
  }
  let lineNo = 0;
  const err = msg => { throw new Error(`Properties line ${lineNo}: ${msg}`); };
  for (const entry of logical) {
    lineNo = entry.no;
    const line = entry.line.replace(/^[ \t]+/, '');
    if (!line) continue;
    if (line[0] === '#' || line[0] === '!') continue;
    // Key ends at the first unescaped =, :, or whitespace
    let idx = -1;
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '\\') { j++; continue; }
      if (line[j] === '=' || line[j] === ':' || line[j] === ' ' || line[j] === '\t') { idx = j; break; }
    }
    let keyRaw, valRaw;
    if (idx < 0) {
      keyRaw = line;
      valRaw = '';
    } else {
      keyRaw = line.slice(0, idx);
      let rest = line.slice(idx).replace(/^[ \t]+/, '');
      if (rest[0] === '=' || rest[0] === ':') rest = rest.slice(1).replace(/^[ \t]+/, '');
      valRaw = rest;
    }
    const key = propUnescape(keyRaw, err);
    if (!key) err('empty key');
    if (key in records) err(`duplicate key "${key}"`);
    records[key] = coerceScalar(propUnescape(valRaw, err), opts);
  }
  return records;
}

function propHasContinuation(line) {
  let n = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

function propUnescape(s, err) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[++i];
    if (n === undefined) break;
    if (n === 'n') out += '\n';
    else if (n === 't') out += '\t';
    else if (n === 'r') out += '\r';
    else if (n === 'f') out += '\f';
    else if (n === 'u') {
      const hex = s.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) err('invalid \\uXXXX escape');
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else out += n;
  }
  return out;
}

// ============================================================
// SERIALIZERS — JS value → format text
// ============================================================

function serializeJson(data, opts) {
  return JSON.stringify(data, null, opts.jsonIndent ?? 2);
}

function serializeNdjson(data) {
  if (!Array.isArray(data)) return JSON.stringify(data);
  return data.map(v => v === undefined ? 'null' : JSON.stringify(v)).join('\n');
}

function serializeYaml(data, opts) {
  return window.jsyaml.dump(data, { indent: opts.yamlIndent ?? 2, lineWidth: -1, noRefs: true });
}

function serializeDelimited(records, delimiter) {
  if (!Array.isArray(records)) throw new Error('Expected an array of records for tabular output');
  if (records.length === 0) return '';
  const keys = [...new Set(records.flatMap(r => r && typeof r === 'object' ? Object.keys(r) : []))];
  if (keys.length === 0) throw new Error('Records have no fields');
  const escape = v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    const s = String(v);
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [keys.map(escape).join(delimiter)];
  for (const r of records) {
    lines.push(keys.map(k => escape(r[k])).join(delimiter));
  }
  return lines.join('\n');
}

function serializeCsv(data, opts) { return serializeDelimited(data, csvDelimiter(opts && opts.csvDelimiterOut)); }
function serializeTsv(data) { return serializeDelimited(data, '\t'); }

function serializeXml(data, opts) {
  const indent = opts.xmlIndent ?? 2;
  const rootTag = opts.xmlRoot || 'rows';
  const itemTag = opts.xmlItem || 'row';
  if (Array.isArray(data)) {
    const indStr = ' '.repeat(indent);
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    lines.push('<' + rootTag + '>');
    for (const r of data) {
      if (r && typeof r === 'object' && !Array.isArray(r)) {
        lines.push(indStr + '<' + itemTag + '>');
        for (const [k, v] of Object.entries(r)) {
          lines.push(indStr + indStr + objectToXmlLine(k, v, indent, 2));
        }
        lines.push(indStr + '</' + itemTag + '>');
      } else {
        lines.push(objectToXml(r, itemTag, indent, 1));
      }
    }
    lines.push('</' + rootTag + '>');
    return lines.join('\n');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + objectToXml(data, rootTag, indent, 0);
}

function objectToXmlLine(tag, val, indent, depth) {
  if (val === null || val === undefined) return '<' + tag + '/>';
  if (typeof val !== 'object') return '<' + tag + '>' + escapeXml(String(val)) + '</' + tag + '>';
  return objectToXml(val, tag, indent, depth);
}

function objectToXml(obj, tag, indent, depth) {
  const ind = ' '.repeat(indent * depth);
  if (obj === null || obj === undefined) return ind + '<' + tag + '/>';
  if (typeof obj !== 'object') return ind + '<' + tag + '>' + escapeXml(String(obj)) + '</' + tag + '>';
  if (Array.isArray(obj)) {
    return obj.map(item => objectToXml(item, tag, indent, depth)).join('\n');
  }
  // @-prefixed keys become attributes, #text becomes element text
  let attrStr = '';
  let text;
  const childEntries = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k[0] === '@' && k.length > 1 && (v === null || typeof v !== 'object')) {
      attrStr += ' ' + k.slice(1) + '="' + escapeXml(v === null ? '' : String(v)) + '"';
    } else if (k === '#text' && (v === null || typeof v !== 'object')) {
      text = v;
    } else {
      childEntries.push([k, v]);
    }
  }
  if (childEntries.length === 0) {
    if (text === null || text === undefined) return ind + '<' + tag + attrStr + '/>';
    return ind + '<' + tag + attrStr + '>' + escapeXml(String(text)) + '</' + tag + '>';
  }
  const lines = [ind + '<' + tag + attrStr + '>'];
  if (text !== null && text !== undefined) {
    lines.push(' '.repeat(indent * (depth + 1)) + escapeXml(String(text)));
  }
  for (const [k, v] of childEntries) {
    lines.push(objectToXml(v, k, indent, depth + 1));
  }
  lines.push(ind + '</' + tag + '>');
  return lines.join('\n');
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function serializeMarkdownTable(records) {
  if (!Array.isArray(records)) throw new Error('Expected an array for Markdown table');
  if (records.length === 0) return '';
  const keys = [...new Set(records.flatMap(r => r && typeof r === 'object' ? Object.keys(r) : []))];
  if (keys.length === 0) throw new Error('Records have no fields');
  const esc = v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    return String(v).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  };
  const lines = [];
  lines.push('| ' + keys.join(' | ') + ' |');
  lines.push('|' + keys.map(() => '---').join('|') + '|');
  for (const r of records) {
    lines.push('| ' + keys.map(k => esc(r[k])).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function serializeHtmlTable(records) {
  if (!Array.isArray(records)) throw new Error('Expected an array for HTML table');
  if (records.length === 0) return '';
  const keys = [...new Set(records.flatMap(r => r && typeof r === 'object' ? Object.keys(r) : []))];
  if (keys.length === 0) throw new Error('Records have no fields');
  const esc = v => {
    if (v == null) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const lines = ['<table>'];
  lines.push('  <thead>');
  lines.push('    <tr>' + keys.map(k => '<th>' + esc(k) + '</th>').join('') + '</tr>');
  lines.push('  </thead>');
  lines.push('  <tbody>');
  for (const r of records) {
    lines.push('    <tr>' + keys.map(k => '<td>' + esc(r[k]) + '</td>').join('') + '</tr>');
  }
  lines.push('  </tbody>');
  lines.push('</table>');
  return lines.join('\n');
}

function sqlIdentQuoter(style) {
  if (style === 'ansi') return id => '"' + String(id).replace(/"/g, '""') + '"';
  if (style === 'bracket') return id => '[' + String(id).replace(/]/g, ']]') + ']';
  return id => '`' + String(id).replace(/`/g, '``') + '`';
}

function serializeSqlInsert(records, opts) {
  if (!Array.isArray(records)) throw new Error('Expected an array for SQL INSERT');
  if (records.length === 0) return '';
  const tableName = (opts.sqlTable || 'data').replace(/[^a-zA-Z0-9_]/g, '');
  const q = sqlIdentQuoter(opts.sqlQuote);
  const keys = [...new Set(records.flatMap(r => r && typeof r === 'object' ? Object.keys(r) : []))];
  if (keys.length === 0) throw new Error('Records have no fields');
  const fmt = v => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return v.toString();
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'object') v = JSON.stringify(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  };
  const colType = k => {
    let type = null;
    for (const r of records) {
      const v = r[k];
      if (v === null || v === undefined) continue;
      let t;
      if (typeof v === 'number') t = Number.isInteger(v) ? 'INTEGER' : 'REAL';
      else if (typeof v === 'boolean') t = 'BOOLEAN';
      else t = 'TEXT';
      if (type === null) type = t;
      else if (type !== t) type = (type + t === 'INTEGERREAL' || type + t === 'REALINTEGER') ? 'REAL' : 'TEXT';
    }
    return type || 'TEXT';
  };
  const lines = [];
  lines.push('CREATE TABLE ' + q(tableName) + ' (');
  keys.forEach((k, i) => {
    lines.push('  ' + q(k) + ' ' + colType(k) + (i === keys.length - 1 ? '' : ','));
  });
  lines.push(');');
  lines.push('');
  lines.push('INSERT INTO ' + q(tableName) + ' (' + keys.map(q).join(', ') + ') VALUES');
  for (let i = 0; i < records.length; i++) {
    const vals = keys.map(k => fmt(records[i][k])).join(', ');
    lines.push('  (' + vals + ')' + (i === records.length - 1 ? ';' : ','));
  }
  return lines.join('\n');
}

function serializeIni(data) {
  if (data === null || data === undefined) return '';
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('INI output needs a top-level object. Wrap your array: e.g. { items: [...] }');
  }
  const lines = [];
  iniEmit(data, [], lines);
  return lines.join('\n').replace(/^\n+/, '');
}

function iniEmit(obj, path, lines) {
  const sectionKeys = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) sectionKeys.push(k);
    else lines.push(k + ' = ' + iniFormatValue(v));
  }
  for (const k of sectionKeys) {
    const subPath = path.concat([k]);
    lines.push('');
    lines.push('[' + subPath.join('.') + ']');
    iniEmit(obj[k], subPath, lines);
  }
}

function iniFormatValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  // INI has no list syntax — arrays ride along as JSON strings
  if (Array.isArray(v) || typeof v === 'object') v = JSON.stringify(v);
  const s = String(v);
  const ambiguous = s === '' || coerceScalar(s, {}) !== s ||
    s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes('\t') ||
    s !== s.trim();
  if (!ambiguous) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}

function serializeProperties(data) {
  if (data === null || data === undefined) return '';
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Properties output needs a top-level object. Wrap your array: e.g. { items: [...] }');
  }
  const lines = [];
  propEmit(data, [], lines);
  return lines.join('\n');
}

function propEmit(obj, path, lines) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      // Nested objects flatten into dotted keys (one-way: parse keeps keys flat)
      propEmit(v, path.concat([k]), lines);
    } else {
      lines.push(propEscapeKey(path.concat([k]).join('.')) + ' = ' + propEscapeValue(v));
    }
  }
}

function propEscapeKey(k) {
  return String(k)
    .replace(/\\/g, '\\\\')
    .replace(/=/g, '\\=')
    .replace(/:/g, '\\:')
    .replace(/ /g, '\\ ')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/^([#!])/, '\\$1');
}

function propEscapeValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') v = JSON.stringify(v);
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/^ /, '\\ ');
}

// ============================================================
// TOML — small focused parser + serializer, ~350 lines.
// Supports TOML 1.0 subset: key=value, strings (basic + literal),
// numbers (int/float, underscores, hex/octal/binary), booleans, arrays,
// inline tables, [section], [a.b.c], [[array-of-tables]], dotted keys
// (a.b = 1), offset datetimes, comments, multi-line strings ("""basic"""
// with escapes + line-ending backslash, '''literal''').
// ============================================================

function parseToml(text) {
  const root = {};
  let current = root;
  const arrayOfTablesMarker = new Set();
  const entries = tomlJoinMultilineStrings(text.split(/\r?\n/));
  let lineNo = 0;
  const err = msg => { throw new Error(`TOML line ${lineNo}: ${msg}`); };

  for (const entry of entries) {
    lineNo = entry.no;
    const line = tomlStripComment(entry.text);
    if (!line) continue;

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const pathStr = line.slice(2, -2).trim();
      if (!pathStr) err('empty array-of-tables header');
      const path = tomlParseKeyPath(pathStr, err);
      const { parent, key } = tomlDescendForWrite(root, path, err);
      if (!(key in parent)) parent[key] = [];
      if (!Array.isArray(parent[key])) err(`[[${pathStr}]] conflicts with existing non-array value`);
      const elem = {};
      parent[key].push(elem);
      current = elem;
      arrayOfTablesMarker.add(path.join('.'));
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const pathStr = line.slice(1, -1).trim();
      if (!pathStr) err('empty table header');
      const path = tomlParseKeyPath(pathStr, err);
      const { parent, key } = tomlDescendForWrite(root, path, err);
      if (arrayOfTablesMarker.has(path.join('.'))) err(`cannot redefine array-of-tables [[${pathStr}]] as [${pathStr}]`);
      if (!(key in parent)) parent[key] = {};
      else if (typeof parent[key] !== 'object' || Array.isArray(parent[key])) err(`[${pathStr}] conflicts with existing non-object value`);
      current = parent[key];
      continue;
    }
    const eqIdx = tomlFindUnquoted(line, '=');
    if (eqIdx < 0) err('expected "key = value" or "[section]"');
    const keyRaw = line.slice(0, eqIdx).trim();
    const valRaw = line.slice(eqIdx + 1).trim();
    if (!keyRaw) err('empty key');
    if (!valRaw) err('empty value');
    const keyPath = tomlParseKeyPath(keyRaw, err);
    const value = tomlParseValue(valRaw, err);
    const { parent, key } = tomlDescendForWrite(current, keyPath, err);
    if (key in parent) err(`duplicate key "${key}"`);
    parent[key] = value;
  }
  return root;
}

// Pre-pass: normalize """basic""" and '''literal''' multi-line strings
// into ordinary single-line basic-string tokens before the line-based
// parser runs. The quote-tracking helpers (tomlStripComment,
// tomlFindUnquoted, tomlSplitTopLevel) never see a multi-line form, so
// they stay simple. Each returned logical line carries the physical
// line it started on, keeping error line numbers accurate.
function tomlJoinMultilineStrings(physicalLines) {
  const entries = [];
  const errAt = (no, msg) => { throw new Error(`TOML line ${no}: ${msg}`); };
  let i = 0;
  while (i < physicalLines.length) {
    const startNo = i + 1;
    let out = '';
    let line = physicalLines[i];
    let pos = 0;
    let inStr = null;
    while (pos < line.length) {
      const c = line[pos];
      if (inStr === '"') {
        if (c === '\\' && pos + 1 < line.length) { out += c + line[pos + 1]; pos += 2; continue; }
        out += c; pos++;
        if (c === '"') inStr = null;
        continue;
      }
      if (inStr === "'") {
        out += c; pos++;
        if (c === "'") inStr = null;
        continue;
      }
      if (c === '#') { out += line.slice(pos); break; }
      if (line.startsWith('"""', pos) || line.startsWith("'''", pos)) {
        const basic = c === '"';
        const closer = basic ? '"""' : "'''";
        const openLine = i + 1;
        pos += 3;
        let raw = '';
        // A newline immediately after the opening delimiter is trimmed
        if (pos >= line.length) {
          i++;
          if (i >= physicalLines.length) errAt(openLine, 'unterminated multi-line string');
          line = physicalLines[i];
          pos = 0;
        }
        for (;;) {
          if (line.startsWith(closer, pos)) { pos += 3; break; }
          if (pos >= line.length) {
            raw += '\n';
            i++;
            if (i >= physicalLines.length) errAt(openLine, 'unterminated multi-line string');
            line = physicalLines[i];
            pos = 0;
            continue;
          }
          const ch = line[pos];
          if (basic && ch === '\\') {
            if (/^\s*$/.test(line.slice(pos + 1))) {
              // Line-ending backslash: trim the newline and all
              // following whitespace up to the next non-blank content
              i++;
              while (i < physicalLines.length && physicalLines[i].trim() === '') i++;
              if (i >= physicalLines.length) errAt(openLine, 'unterminated multi-line string');
              line = physicalLines[i].replace(/^\s+/, '');
              pos = 0;
              continue;
            }
            raw += ch + line[pos + 1];
            pos += 2;
            continue;
          }
          raw += ch;
          pos++;
        }
        const value = basic
          ? tomlParseBasicString('"' + raw + '"', msg => errAt(openLine, msg))
          : raw;
        out += tomlFormatValue(value);
        continue;
      }
      if (c === '"' || c === "'") { inStr = c; out += c; pos++; continue; }
      out += c;
      pos++;
    }
    entries.push({ text: out, no: startNo });
    i++;
  }
  return entries;
}

function tomlStripComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '\\' && inStr === '"' && i + 1 < line.length) { i++; continue; }
      if (c === inStr) inStr = null;
    } else {
      if (c === '"' || c === "'") inStr = c;
      else if (c === '#') return line.slice(0, i).trim();
    }
  }
  return line.trim();
}

function tomlFindUnquoted(s, ch) {
  let inStr = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\' && inStr === '"' && i + 1 < s.length) { i++; continue; }
      if (c === inStr) inStr = null;
    } else {
      if (c === '"' || c === "'") inStr = c;
      else if (c === ch) return i;
    }
  }
  return -1;
}

function tomlParseKeyPath(pathStr, err) {
  const parts = [];
  let buf = '', inStr = null;
  for (let i = 0; i < pathStr.length; i++) {
    const c = pathStr[i];
    if (inStr) {
      if (c === '\\' && inStr === '"' && i + 1 < pathStr.length) { buf += c + pathStr[++i]; continue; }
      buf += c;
      if (c === inStr) inStr = null;
    } else {
      if (c === '"' || c === "'") { inStr = c; buf += c; }
      else if (c === '.') {
        const k = tomlParseKeySingle(buf.trim(), err);
        parts.push(k);
        buf = '';
      } else buf += c;
    }
  }
  parts.push(tomlParseKeySingle(buf.trim(), err));
  return parts;
}

function tomlParseKeySingle(k, err) {
  if (!k) err('empty key');
  if (k[0] === '"' && k[k.length - 1] === '"') return tomlParseBasicString(k, err);
  if (k[0] === "'" && k[k.length - 1] === "'") return k.slice(1, -1);
  if (!/^[A-Za-z0-9_-]+$/.test(k)) err(`invalid bare key "${k}" — quote if it has special chars`);
  return k;
}

function tomlDescendForWrite(root, path, err) {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (!(seg in node)) node[seg] = {};
    else if (Array.isArray(node[seg])) { node = node[seg][node[seg].length - 1]; continue; }
    else if (typeof node[seg] !== 'object') err(`path "${path.slice(0, i + 1).join('.')}" is not a table`);
    node = node[seg];
  }
  return { parent: node, key: path[path.length - 1] };
}

function tomlParseValue(s, err) {
  const c = s[0];
  if (c === '"') return tomlParseBasicString(s, err);
  if (c === "'") return tomlParseLiteralString(s, err);
  if (c === '[') return tomlParseArray(s, err);
  if (c === '{') return tomlParseInlineTable(s, err);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = tomlParseDateTime(s);
    if (d) return d;
  }
  return tomlParseNumber(s, err);
}

function tomlParseBasicString(s, err) {
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') err(`malformed basic string: ${s.slice(0, 20)}`);
  let out = '';
  for (let i = 1; i < s.length - 1; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === '"') out += '"';
      else if (n === '\\') out += '\\';
      else if (n === '/') out += '/';
      else if (n === 'b') out += '\b';
      else if (n === 'f') out += '\f';
      else if (n === 'u') {
        const hex = s.slice(i + 1, i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) err(`invalid \\uXXXX escape`);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else err(`invalid escape \\${n}`);
    } else out += c;
  }
  return out;
}

function tomlParseLiteralString(s, err) {
  if (s.length < 2 || s[0] !== "'" || s[s.length - 1] !== "'") err(`malformed literal string: ${s.slice(0, 20)}`);
  return s.slice(1, -1);
}

function tomlParseNumber(s, err) {
  const normalized = s.replace(/_/g, '');
  if (/^0x[0-9a-fA-F]+$/.test(normalized)) return parseInt(normalized.slice(2), 16);
  if (/^0o[0-7]+$/.test(normalized)) return parseInt(normalized.slice(2), 8);
  if (/^0b[01]+$/.test(normalized)) return parseInt(normalized.slice(2), 2);
  if (/^[+-]?\d+$/.test(normalized)) {
    const n = parseInt(normalized, 10);
    if (!Number.isFinite(n)) err(`integer out of range: ${s}`);
    return n;
  }
  if (/^[+-]?(\d+\.\d+|\.\d+|\d+\.)([eE][+-]?\d+)?$/.test(normalized) || /^[+-]?\d+[eE][+-]?\d+$/.test(normalized)) {
    const n = parseFloat(normalized);
    if (!Number.isFinite(n)) err(`float out of range: ${s}`);
    return n;
  }
  if (normalized === 'inf' || normalized === '+inf') return Infinity;
  if (normalized === '-inf') return -Infinity;
  if (normalized === 'nan' || normalized === '+nan' || normalized === '-nan') return NaN;
  err(`unrecognized value: ${s}`);
}

function tomlParseDateTime(s) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  if (/^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    const d = new Date(s.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function tomlParseArray(s, err) {
  if (s[0] !== '[' || s[s.length - 1] !== ']') err(`malformed array: ${s.slice(0, 20)}`);
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  return tomlSplitTopLevel(inner, ',').map(item => tomlParseValue(item.trim(), err));
}

function tomlParseInlineTable(s, err) {
  if (s[0] !== '{' || s[s.length - 1] !== '}') err(`malformed inline table: ${s.slice(0, 20)}`);
  const inner = s.slice(1, -1).trim();
  if (!inner) return {};
  const obj = {};
  for (const pair of tomlSplitTopLevel(inner, ',')) {
    const eqIdx = tomlFindUnquoted(pair, '=');
    if (eqIdx < 0) err(`inline table entry missing "=": ${pair}`);
    const k = tomlParseKeySingle(pair.slice(0, eqIdx).trim(), err);
    obj[k] = tomlParseValue(pair.slice(eqIdx + 1).trim(), err);
  }
  return obj;
}

function tomlSplitTopLevel(s, sep) {
  const parts = [];
  let buf = '', depthArr = 0, depthObj = 0, inStr = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === '\\' && inStr === '"' && i + 1 < s.length) { buf += s[++i]; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; buf += c; continue; }
    if (c === '[') depthArr++;
    else if (c === ']') depthArr--;
    else if (c === '{') depthObj++;
    else if (c === '}') depthObj--;
    else if (c === sep && depthArr === 0 && depthObj === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

function parseToml_wrap(text) { return parseToml(text); }

function serializeToml(data) {
  if (data === null || data === undefined) return '';
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('TOML output needs a top-level object. Wrap your array: e.g. { items: [...] }');
  }
  const lines = [];
  tomlEmit(data, [], lines);
  return lines.join('\n').replace(/^\n+/, '');  // trim leading blank line
}

function tomlEmit(obj, path, lines) {
  const tableKeys = [], arrayOfTableKeys = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === null || v === undefined) continue;
    if (tomlIsPlainObject(v)) tableKeys.push(k);
    else if (Array.isArray(v) && v.length && v.every(tomlIsPlainObject)) arrayOfTableKeys.push(k);
    else lines.push(tomlFormatKey(k) + ' = ' + tomlFormatValue(v));
  }
  for (const k of tableKeys) {
    const subPath = path.concat([k]);
    lines.push('');
    lines.push('[' + subPath.map(tomlFormatKey).join('.') + ']');
    tomlEmit(obj[k], subPath, lines);
  }
  for (const k of arrayOfTableKeys) {
    const subPath = path.concat([k]);
    for (const item of obj[k]) {
      lines.push('');
      lines.push('[[' + subPath.map(tomlFormatKey).join('.') + ']]');
      tomlEmit(item, subPath, lines);
    }
  }
}

function tomlIsPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

function tomlFormatKey(k) {
  if (/^[A-Za-z0-9_-]+$/.test(k)) return k;
  return '"' + k.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function tomlFormatValue(v) {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : (v > 0 ? 'inf' : '-inf');
    return String(v);
  }
  if (typeof v === 'string') {
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
  }
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return '[' + v.map(tomlFormatValue).join(', ') + ']';
  if (typeof v === 'object') {
    const parts = [];
    for (const k of Object.keys(v)) parts.push(tomlFormatKey(k) + ' = ' + tomlFormatValue(v[k]));
    return '{ ' + parts.join(', ') + ' }';
  }
  return JSON.stringify(v);
}

// Registry
const PARSERS = { json: parseJson, ndjson: parseNdjson, yaml: parseYaml, toml: parseToml, ini: parseIni, properties: parseProperties, csv: parseCsv, tsv: parseTsv, xml: parseXml, md: parseMarkdownTable, html: parseHtmlTable, sql: parseSqlInsert };
const SERIALIZERS = { json: serializeJson, ndjson: serializeNdjson, yaml: serializeYaml, toml: serializeToml, ini: serializeIni, properties: serializeProperties, csv: serializeCsv, tsv: serializeTsv, xml: serializeXml, md: serializeMarkdownTable, html: serializeHtmlTable, sql: serializeSqlInsert };

return { PARSERS, SERIALIZERS };
};
