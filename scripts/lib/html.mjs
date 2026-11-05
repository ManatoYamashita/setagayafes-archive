// A small HTML tokenizer for the guard scripts.
//
// It follows the HTML tokenizer's tag and attribute states closely enough to
// read start tags and their attributes the way a browser does:
// - quoted attribute values may contain ">", "/" and "=";
// - attributes may be separated by "/" as well as whitespace;
// - comments are skipped;
// - the contents of raw-text and RCDATA elements (<style>, <title>, ...) are
//   not parsed as markup.
//
// It is not a full HTML parser. It only has to answer "which start tags and
// attributes would the browser see?", which is all the guard needs.

/** Elements whose contents the browser does not parse as markup. */
const RAW_TEXT_ELEMENTS = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
]);

const WHITESPACE = /[\t\n\f\r ]/;
const ASCII_ALPHA = /[A-Za-z]/;

/**
 * @typedef {{ name: string, value: string }} Attribute
 * @typedef {{ name: string, attributes: Attribute[], source: string }} StartTag
 */

/**
 * Returns every start tag in the document, in order.
 * Attribute names and tag names are lowercased. Attribute values are returned
 * raw (character references are not decoded; see decodeCharacterReferences).
 *
 * @param {string} html
 * @returns {StartTag[]}
 */
export function startTags(html) {
  /** @type {StartTag[]} */
  const tags = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;
    i = lt + 1;

    if (html.startsWith("!--", i)) {
      i = skipComment(html, i + 3);
      continue;
    }
    if (html[i] === "!" || html[i] === "?") {
      // Bogus comment or DOCTYPE: ends at the next ">".
      const gt = html.indexOf(">", i);
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }
    if (html[i] === "/") {
      // End tag: skip it (attributes on end tags are ignored by browsers).
      const gt = html.indexOf(">", i);
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }
    if (!ASCII_ALPHA.test(html[i] ?? "")) continue; // A literal "<" in text.

    const start = lt;
    let name = "";
    while (
      i < html.length &&
      !WHITESPACE.test(html[i] ?? "") &&
      html[i] !== "/" &&
      html[i] !== ">"
    ) {
      name += html[i];
      i += 1;
    }
    name = name.toLowerCase();

    /** @type {Attribute[]} */
    const attributes = [];
    while (i < html.length && html[i] !== ">") {
      const ch = html[i] ?? "";
      if (WHITESPACE.test(ch) || ch === "/") {
        i += 1;
        continue;
      }

      // Attribute name. A leading "=" is part of the name, as in the spec.
      let attrName = ch;
      i += 1;
      while (i < html.length) {
        const c = html[i] ?? "";
        if (WHITESPACE.test(c) || c === "/" || c === ">" || c === "=") break;
        attrName += c;
        i += 1;
      }
      while (i < html.length && WHITESPACE.test(html[i] ?? "")) i += 1;

      let value = "";
      if (html[i] === "=") {
        i += 1;
        while (i < html.length && WHITESPACE.test(html[i] ?? "")) i += 1;
        const quote = html[i];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, i + 1);
          value = html.slice(i + 1, end === -1 ? html.length : end);
          i = end === -1 ? html.length : end + 1;
        } else {
          while (i < html.length && !WHITESPACE.test(html[i] ?? "") && html[i] !== ">") {
            value += html[i];
            i += 1;
          }
        }
      }
      attributes.push({ name: attrName.toLowerCase(), value });
    }
    i += 1; // Past ">".

    tags.push({ name, attributes, source: html.slice(start, Math.min(i, html.length)) });

    if (RAW_TEXT_ELEMENTS.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      i = close === -1 ? html.length : close;
    }
  }

  return tags;
}

/**
 * @param {string} html
 * @param {number} i Index just after "<!--".
 * @returns {number} Index just after the end of the comment.
 */
function skipComment(html, i) {
  // "<!-->" and "<!--->" close the comment immediately.
  if (html[i] === ">") return i + 1;
  if (html.startsWith("->", i)) return i + 2;
  const end = html.indexOf("-->", i);
  return end === -1 ? html.length : end + 3;
}

/**
 * The value of an attribute as the browser sees it: the first occurrence wins
 * when an attribute is repeated.
 *
 * @param {StartTag} tag
 * @param {string} name Lowercase attribute name.
 * @returns {string | undefined}
 */
export function attribute(tag, name) {
  return tag.attributes.find((attr) => attr.name === name)?.value;
}

/** Named character references that matter for hiding a URL scheme. */
const NAMED_REFERENCES = {
  amp: "&",
  colon: ":",
  tab: "\t",
  newline: "\n",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  sol: "/",
  period: ".",
  lpar: "(",
  rpar: ")",
};

/**
 * Decodes numeric character references and the named references above.
 *
 * @param {string} value
 * @returns {string}
 */
export function decodeCharacterReferences(value) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi, (match, body) => {
    const lower = String(body).toLowerCase();
    if (lower.startsWith("#x"))
      return safeFromCodePoint(Number.parseInt(lower.slice(2), 16), match);
    if (lower.startsWith("#")) return safeFromCodePoint(Number.parseInt(lower.slice(1), 10), match);
    return NAMED_REFERENCES[/** @type {keyof typeof NAMED_REFERENCES} */ (lower)] ?? match;
  });
}

/**
 * @param {number} codePoint
 * @param {string} fallback
 */
function safeFromCodePoint(codePoint, fallback) {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}
