// The <img> tags whose srcset and sizes scripts/ops/fit-image-sizes.mjs
// rewrites, per page. See docs/ops/repair-past-sites.md.
//
// Widths were measured in Chromium on the archive (2026-11-23). The 96th uses
// the Bootstrap container of its theme: the content is 100vw - 30px below
// 576px, then 510, 690, 930 and 1110px at 576, 768, 992 and 1200px.
//
// Each sizes value is a little wider than the measured width (rounded up by
// about 1px). The images without width/height attributes take their width
// from the chosen candidate and sizes, capped by max-width: 100%; a sizes
// value narrower than the box would shrink them.

const ARCHIVE = "https://archive.setagayafes.org";
const U95 = `${ARCHIVE}/95th/wp-content/uploads/2024/10`;
const U96_10 = `${ARCHIVE}/96th/wp-content/uploads/2025/10`;

// The square images in the three columns ("aspect-ratio:1; object-fit:cover").
// Measured: 101px at 360, 118px at 412, 161px at 576-767, 221px at 768-991,
// 299px at 992-1199, 359px from 1200. Below 576px: (100vw - 30px - 2 gaps) / 3.
// The pictures are square or portrait, so the width decides the size needed.
const THREE_COLUMNS =
  "(min-width: 1200px) 360px, (min-width: 992px) 300px, (min-width: 768px) 222px, " +
  "(min-width: 576px) 162px, calc((100vw - 56px) / 3)";

/** @type {Record<string, import("../lib/image-sizes.mjs").ImageRule[]>} */
export const RULES = {
  "96th/index.html": [
    {
      why: "96th header logo: shown 183x50 (220x60 from 992px), loaded as the 2560px original",
      src: "/96th/wp-content/uploads/2025/10/第96回世田谷祭-scaled.png",
      srcset: [
        [`${U96_10}/第96回世田谷祭-300x82.png`, 300],
        [`${U96_10}/第96回世田谷祭-768x210.png`, 768],
        [`${U96_10}/第96回世田谷祭-scaled.png`, 2560],
      ],
      // The logo is sized by max-height (50px, 60px) and width: auto, so its
      // width must not come out narrower than 183px / 220px: a little wider
      // here, and max-height keeps the shown size.
      sizes: "(min-width: 992px) 230px, 190px",
    },
    {
      why: "96th timetable (day 1): a square column, sizes said 100vw",
      className: "wp-image-344",
      sizes: THREE_COLUMNS,
    },
    {
      why: "95th photo in the 96th columns: no srcset, loaded as the 1024px file",
      className: "wp-image-1057",
      srcset: [
        [`${U95}/40c6707bd1eb5057edeb6275bcbee890-300x300.jpg`, 300],
        [`${U95}/40c6707bd1eb5057edeb6275bcbee890-768x768.jpg`, 768],
        [`${U95}/40c6707bd1eb5057edeb6275bcbee890-1024x1024.jpg`, 1024],
      ],
      sizes: THREE_COLUMNS,
    },
    {
      why: "95th photo in the 96th columns: no srcset, loaded as the 426px original",
      className: "wp-image-1059",
      srcset: [
        [`${U95}/ae526ecf92feb8d7c358209c9a6eed54-300x300.jpg`, 300],
        [`${U95}/ae526ecf92feb8d7c358209c9a6eed54.jpg`, 426],
      ],
      sizes: THREE_COLUMNS,
    },
    {
      why: "95th image in the 96th columns: no srcset, loaded as the 672px original",
      className: "wp-image-1271",
      srcset: [
        [`${U95}/76d992dcff631d69631627e1692b40fb-1-300x294.png`, 300],
        [`${U95}/76d992dcff631d69631627e1692b40fb-1.png`, 672],
      ],
      sizes: THREE_COLUMNS,
    },
  ],
};
