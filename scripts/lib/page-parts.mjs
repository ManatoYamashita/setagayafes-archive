// How the browser checks find the parts of the top page. Shared by the e2e
// tests (dist/) and `pnpm check:production:browser` (the production host), so a
// change to the markup is fixed in one place.

/** @typedef {import("playwright").Page} Page */
/** @typedef {"all" | "musashi" | "tcu"} EraFilter */

/**
 * The MENU button is an icon with only an `aria-label` (the same "MENU" in both
 * languages), so a search by its text finds nothing. Find it by its role.
 *
 * @param {Page} page
 */
export const menuButton = (page) => page.getByRole("button", { name: "MENU" });

/** @param {Page} page */
export const siteMenu = (page) => page.locator("#site-menu");

/**
 * Found without its wording, which differs by language.
 *
 * @param {Page} page
 */
export const menuCloseButton = (page) =>
  siteMenu(page).locator('button[popovertargetaction="hide"]');

/**
 * The radio itself is visually hidden; click its label instead.
 *
 * @param {Page} page
 * @param {EraFilter} era
 */
export const eraLabel = (page, era) => page.locator(`label:has(#era-${era})`);

/**
 * @param {Page} page
 * @param {EraFilter} era
 */
export const eraRadio = (page, era) => page.locator(`#era-${era}`);

/**
 * The filter hides cards with CSS (`:has()`), so count the visible ones.
 *
 * @param {Page} page
 */
export const visibleCards = (page) => page.locator(".grid > li:visible");

/**
 * Collects console errors, uncaught errors, error responses and failed
 * requests from now on (requests the browser cancels itself are not counted). Read the array after the page has settled.
 *
 * @param {Page} page
 * @returns {string[]}
 */
export function watchProblems(page) {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown";
    // The browser cancels lazy images that the era filter hides before they
    // load. The server is not at fault.
    if (reason === "net::ERR_ABORTED") return;
    problems.push(`failed: ${request.url()} (${reason})`);
  });
  return problems;
}
