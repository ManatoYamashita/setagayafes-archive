// Tests for scripts/lib/image-sizes.mjs (the srcset/sizes rewrite used by
// scripts/ops/fit-image-sizes.mjs) and the rules in
// scripts/ops/image-sizes-rules.mjs. Run with `pnpm test`.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attribute, startTags } from "./lib/html.mjs";
import { fitImageSizes, setAttribute } from "./lib/image-sizes.mjs";
import { RULES } from "./ops/image-sizes-rules.mjs";

const A = "https://archive.setagayafes.org/96th/wp-content/uploads";
const PAGE = [
  "<h1><a><span>",
  `<img src="${A}/logo-scaled.png" alt="logo" />`,
  "</span></a></h1>",
  `<img decoding="async" width="2270" height="2560" src="${A}/t-scaled.png" class="wp-image-344" srcset="${A}/t-scaled.png 2270w, ${A}/t-266x300.png 266w" sizes="(max-width: 2270px) 100vw, 2270px" />`,
  `<img decoding="async" src="${A}/p.jpg" alt="" class="wp-image-1059" style="aspect-ratio:1;object-fit:cover"/>`,
].join("\n");

const everything = () => true;

/** @param {string} html @param {string} className */
function img(html, className) {
  return startTags(html).find((tag) =>
    (attribute(tag, "class") ?? "").split(" ").includes(className),
  );
}

describe("fitImageSizes", () => {
  test("replaces sizes and keeps the tag's own srcset", () => {
    const { html, results } = fitImageSizes(
      PAGE,
      [{ why: "t", className: "wp-image-344", sizes: "300px" }],
      everything,
    );
    assert.deepEqual(results, [{ why: "t", status: "changed" }]);
    const tag = img(html, "wp-image-344");
    assert.equal(attribute(tag, "sizes"), "300px");
    assert.equal(attribute(tag, "srcset"), `${A}/t-scaled.png 2270w, ${A}/t-266x300.png 266w`);
    assert.equal(attribute(tag, "width"), "2270");
  });

  test("adds srcset and sizes to a tag without them, keeping the rest of the page", () => {
    const rule = {
      why: "p",
      className: "wp-image-1059",
      srcset: /** @type {[string, number][]} */ ([
        [`${A}/p-300x300.jpg`, 300],
        [`${A}/p.jpg`, 426],
      ]),
      sizes: "120px",
    };
    const { html } = fitImageSizes(PAGE, [rule], everything);
    const tag = img(html, "wp-image-1059");
    assert.equal(attribute(tag, "srcset"), `${A}/p-300x300.jpg 300w, ${A}/p.jpg 426w`);
    assert.equal(attribute(tag, "sizes"), "120px");
    assert.equal(attribute(tag, "src"), `${A}/p.jpg`);
    assert.equal(attribute(tag, "style"), "aspect-ratio:1;object-fit:cover");
    assert.equal(html.replace(tag.source, ""), PAGE.replace(img(PAGE, "wp-image-1059").source, ""));
  });

  test("matches by the end of src", () => {
    const rule = {
      why: "logo",
      src: "/logo-scaled.png",
      srcset: /** @type {[string, number][]} */ ([[`${A}/logo-300x82.png`, 300]]),
      sizes: "190px",
    };
    const { html, results } = fitImageSizes(PAGE, [rule], everything);
    assert.equal(results[0].status, "changed");
    assert.match(html, /alt="logo" srcset="[^"]+logo-300x82\.png 300w" sizes="190px" \/>/);
  });

  test("skips a rule whose candidate is not on the server", () => {
    const rule = {
      why: "p",
      className: "wp-image-1059",
      srcset: /** @type {[string, number][]} */ ([[`${A}/p-300x300.jpg`, 300]]),
      sizes: "120px",
    };
    const { html, results } = fitImageSizes(PAGE, [rule], (url) => !url.endsWith("p-300x300.jpg"));
    assert.equal(results[0].status, "skipped");
    assert.match(results[0].reason ?? "", /not on the server/);
    assert.equal(html, PAGE);
  });

  test("skips a srcset for a tag that already has one", () => {
    const rule = {
      why: "t",
      className: "wp-image-344",
      srcset: /** @type {[string, number][]} */ ([[`${A}/t.png`, 10]]),
      sizes: "1px",
    };
    const { html, results } = fitImageSizes(PAGE, [rule], everything);
    assert.equal(results[0].status, "skipped");
    assert.equal(html, PAGE);
  });

  test("skips a rule that matches no tag or several", () => {
    const twice = `${PAGE}\n<img class="wp-image-344" src="x.png">`;
    const none = fitImageSizes(
      PAGE,
      [{ why: "n", className: "wp-image-1", sizes: "1px" }],
      everything,
    );
    const many = fitImageSizes(
      twice,
      [{ why: "m", className: "wp-image-344", sizes: "1px" }],
      everything,
    );
    assert.equal(none.results[0].reason, "0 tags match");
    assert.equal(many.results[0].reason, "2 tags match");
    assert.equal(many.html, twice);
  });
});

describe("setAttribute", () => {
  test("adds before the end of a tag, with or without the slash", () => {
    assert.equal(setAttribute('<img src="a">', "sizes", "1px"), '<img src="a" sizes="1px">');
    assert.equal(setAttribute('<img src="a"/>', "sizes", "1px"), '<img src="a" sizes="1px"/>');
  });

  test("does not take a value with a double quote", () => {
    assert.throws(() => setAttribute("<img>", "sizes", '1px" onerror="x'));
  });
});

describe("rules", () => {
  test("every candidate is an https URL on the archive and every rule names its tag", () => {
    for (const rules of Object.values(RULES)) {
      for (const rule of rules) {
        assert.ok(rule.className || rule.src, rule.why);
        assert.ok(rule.sizes && !rule.sizes.includes('"'), rule.why);
        for (const [url, width] of rule.srcset ?? []) {
          assert.ok(url.startsWith("https://archive.setagayafes.org/"), url);
          assert.ok(Number.isInteger(width) && width > 0, url);
        }
      }
    }
  });
});
