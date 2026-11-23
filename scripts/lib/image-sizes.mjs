// Rewrites the srcset and sizes of chosen <img> tags in a past festival page,
// so that the browser picks an image file close to the size it is shown at.
// Used by scripts/ops/fit-image-sizes.mjs. Pure functions, tested in
// scripts/image-sizes.test.mjs.
//
// Only the two attributes are touched, and every candidate must be a file that
// is already on the server. No image is made or changed, so what each page
// shows stays as it was; only which of the existing sizes the browser loads
// changes.

import { attribute, startTags } from "./html.mjs";

/**
 * @typedef {object} ImageRule
 * @property {string} why        Why the rule exists (kept in the report).
 * @property {string} [className] Match <img> tags with this class.
 * @property {string} [src]       Match <img> tags whose src ends with this.
 * @property {[string, number][]} [srcset]
 *   Candidates as [URL, width]. Only for tags without a srcset of their own.
 * @property {string} sizes      The new sizes attribute.
 */

/**
 * @typedef {object} RuleResult
 * @property {string} why
 * @property {"changed" | "skipped"} status
 * @property {string} [reason]   Why a rule was skipped.
 */

/**
 * Applies the rules to one page.
 *
 * A rule is skipped (and the tag left as it is) when it matches no tag or more
 * than one, when a candidate is not on the server, or when it gives a srcset
 * for a tag that already has one.
 *
 * @param {string} html
 * @param {ImageRule[]} rules
 * @param {(url: string) => boolean} exists Whether the URL is a file on the server.
 * @returns {{ html: string, results: RuleResult[] }}
 */
export function fitImageSizes(html, rules, exists) {
  const images = startTags(html).filter((tag) => tag.name === "img");
  /** @type {RuleResult[]} */
  const results = [];
  let next = html;

  for (const rule of rules) {
    const matches = images.filter((tag) => matchesRule(tag, rule));
    if (matches.length !== 1) {
      results.push({ why: rule.why, status: "skipped", reason: `${matches.length} tags match` });
      continue;
    }
    const [tag] = matches;
    if (rule.srcset && attribute(tag, "srcset") !== undefined) {
      results.push({ why: rule.why, status: "skipped", reason: "the tag already has a srcset" });
      continue;
    }
    const missing = (rule.srcset ?? []).map(([url]) => url).filter((url) => !exists(url));
    if (missing.length > 0) {
      results.push({
        why: rule.why,
        status: "skipped",
        reason: `not on the server: ${missing.join(", ")}`,
      });
      continue;
    }
    // The tag's source text is unique in the page: each rule matches one tag
    // by its class or src, and the page has no two identical <img> tags.
    if (next.split(tag.source).length !== 2) {
      results.push({ why: rule.why, status: "skipped", reason: "the tag's text is not unique" });
      continue;
    }

    let source = tag.source;
    if (rule.srcset) {
      const srcset = rule.srcset.map(([url, width]) => `${url} ${width}w`).join(", ");
      source = setAttribute(source, "srcset", srcset);
    }
    source = setAttribute(source, "sizes", rule.sizes);
    next = next.replace(tag.source, () => source);
    results.push({ why: rule.why, status: "changed" });
  }

  return { html: next, results };
}

/**
 * @param {import("./html.mjs").StartTag} tag
 * @param {ImageRule} rule
 */
function matchesRule(tag, rule) {
  if (rule.className !== undefined) {
    const classes = (attribute(tag, "class") ?? "").split(/\s+/);
    if (!classes.includes(rule.className)) return false;
  }
  if (rule.src !== undefined) {
    if (!(attribute(tag, "src") ?? "").endsWith(rule.src)) return false;
  }
  return rule.className !== undefined || rule.src !== undefined;
}

/**
 * Replaces the value of a double-quoted attribute in a start tag, or adds the
 * attribute before the tag's end. The pages written by WordPress quote every
 * attribute with double quotes.
 *
 * @param {string} source The start tag's text.
 * @param {string} name
 * @param {string} value Must not contain a double quote.
 */
export function setAttribute(source, name, value) {
  if (value.includes('"')) throw new Error(`a double quote in the value of ${name}`);
  const existing = new RegExp(`(\\s${name}=)"[^"]*"`, "i");
  if (existing.test(source)) return source.replace(existing, (_, head) => `${head}"${value}"`);
  return source.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end}`);
}
