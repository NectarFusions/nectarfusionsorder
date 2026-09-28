import fs from "node:fs/promises";

const HOST = "nectar-fusions.com";
const ORIGIN = `https://${HOST}`;
const KEY = "e900382a50e0472b9fe5d1d38153f406";
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const sitemap = await fs.readFile(
  new URL("../public/sitemap.xml", import.meta.url),
  "utf8"
);

const urlList = [
  ...sitemap.matchAll(/<loc>(.*?)<\/loc>/g),
]
  .map((match) => match[1].trim())
  .filter((url) => {
    try {
      return new URL(url).hostname === HOST;
    } catch {
      return false;
    }
  });

if (!urlList.length) {
  throw new Error("No NectarFusions URLs were found in public/sitemap.xml.");
}

const response = await fetch(INDEXNOW_ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  }),
});

const responseText = await response.text();

if (!response.ok) {
  throw new Error(
    `IndexNow submission failed with HTTP ${response.status}${
      responseText ? `: ${responseText}` : ""
    }`
  );
}

console.log(
  `IndexNow accepted ${urlList.length} NectarFusions URL${
    urlList.length === 1 ? "" : "s"
  }.`
);
console.log(`HTTP ${response.status}`);
console.log(`Key location: ${KEY_LOCATION}`);
