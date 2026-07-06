'use strict';

// GENERATED copy of test/dom-shim.js by tools/build-package.js — DO NOT EDIT.

// Minimal DOMParser stand-in so the Format Flipper engine can run under
// Node. It implements only what the engine touches: element trees,
// tagName, children, textContent, and tag-name querySelector(All).
// XML mode reports malformed markup through a <parsererror> node, which
// is the browser contract that parseXml() relies on.

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.childNodes = [];
    this.attributes = [];
  }
  get children() {
    return this.childNodes.filter(n => n instanceof Element);
  }
  get textContent() {
    return this.childNodes.map(n => (n instanceof Element ? n.textContent : n)).join('');
  }
  querySelector(tag) {
    return this.querySelectorAll(tag)[0] || null;
  }
  querySelectorAll(tag) {
    const want = tag.toLowerCase();
    const out = [];
    const walk = node => {
      for (const child of node.children) {
        if (child.tagName.toLowerCase() === want) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

class Document extends Element {
  constructor() {
    super('#document');
  }
  get documentElement() {
    return this.children[0] || null;
  }
}

function parseMarkup(src, html) {
  const doc = new Document();
  const stack = [doc];
  let i = 0;

  while (i < src.length) {
    if (src[i] !== '<') {
      const next = src.indexOf('<', i);
      const end = next < 0 ? src.length : next;
      const text = src.slice(i, end);
      if (text) stack[stack.length - 1].childNodes.push(decodeEntities(text));
      i = end;
      continue;
    }
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) {
        if (!html) throw new Error('unterminated comment');
        break;
      }
      i = end + 3;
      continue;
    }
    if (src.startsWith('<!', i) || src.startsWith('<?', i)) {
      const end = src.indexOf('>', i);
      if (end < 0) {
        if (!html) throw new Error('unterminated declaration');
        break;
      }
      i = end + 1;
      continue;
    }
    if (src.startsWith('</', i)) {
      const end = src.indexOf('>', i);
      if (end < 0) {
        if (!html) throw new Error('unterminated closing tag');
        break;
      }
      let name = src.slice(i + 2, end).trim();
      if (html) name = name.toLowerCase();
      if (html) {
        for (let d = stack.length - 1; d >= 1; d--) {
          if (stack[d].tagName === name) { stack.length = d; break; }
        }
      } else {
        const top = stack[stack.length - 1];
        if (top === doc || top.tagName !== name) {
          throw new Error(`unexpected closing tag </${name}>`);
        }
        stack.pop();
      }
      i = end + 1;
      continue;
    }
    const m = /^<([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(src.slice(i));
    if (!m) {
      if (!html) throw new Error('invalid markup: stray "<"');
      stack[stack.length - 1].childNodes.push('<');
      i++;
      continue;
    }
    let name = m[1];
    if (html) name = name.toLowerCase();
    i += m[0].length;
    const attrs = [];
    let selfClose = false;
    let closed = false;
    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === '>') { closed = true; i++; break; }
      if (src[i] === '/' && src[i + 1] === '>') { selfClose = true; closed = true; i += 2; break; }
      const am = /^[^\s=/>]+/.exec(src.slice(i));
      if (!am) { i++; continue; }
      const attrName = html ? am[0].toLowerCase() : am[0];
      i += am[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      let attrValue = '';
      if (src[i] === '=') {
        i++;
        while (i < src.length && /\s/.test(src[i])) i++;
        const q = src[i];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, i + 1);
          if (end < 0) {
            if (!html) throw new Error('unterminated attribute value');
            attrValue = src.slice(i + 1);
            i = src.length;
          } else {
            attrValue = src.slice(i + 1, end);
            i = end + 1;
          }
        } else {
          const vm = /^[^\s>]*/.exec(src.slice(i));
          attrValue = vm[0];
          i += vm[0].length;
          if (attrValue.endsWith('/') && src[i] === '>') {
            attrValue = attrValue.slice(0, -1);
            i--;
          }
        }
      }
      attrs.push({ name: attrName, value: decodeEntities(attrValue) });
    }
    if (!closed) {
      if (!html) throw new Error(`unterminated tag <${name}>`);
      break;
    }
    const el = new Element(name);
    el.attributes = attrs;
    stack[stack.length - 1].childNodes.push(el);
    if (!selfClose && !(html && VOID_TAGS.has(name))) stack.push(el);
  }

  if (!html) {
    if (stack.length !== 1) throw new Error(`unclosed tag <${stack[stack.length - 1].tagName}>`);
    if (doc.children.length !== 1) throw new Error('document must have exactly one root element');
    for (const n of doc.childNodes) {
      if (!(n instanceof Element) && n.trim() !== '') {
        throw new Error('text content outside the root element');
      }
    }
  }
  return doc;
}

class DOMParser {
  parseFromString(src, type) {
    const html = type === 'text/html';
    try {
      return parseMarkup(src, html);
    } catch (err) {
      if (html) return new Document();
      const doc = new Document();
      const errEl = new Element('parsererror');
      errEl.childNodes.push(String(err.message));
      doc.childNodes.push(errEl);
      return doc;
    }
  }
}

module.exports = { DOMParser, Element, Document };
