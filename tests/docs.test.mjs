import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");
const docs = ["manual.html", "historia.html", "especificaciones.html"];

function idsIn(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

test("configuration exposes the three documentation entrances", async () => {
  const html = await read("index.html");
  const expected = [
    ["userManualLink", "docs/manual.html"],
    ["thereminHistoryLink", "docs/historia.html"],
    ["technicalSpecsLink", "docs/especificaciones.html"],
  ];
  for (const [id, href] of expected) {
    const element = html.match(new RegExp(`<a[^>]*id="${id}"[^>]*>`, "s"))?.[0] ?? "";
    assert.match(element, new RegExp(`href="${href.replace(".", "\\.")}"`));
    assert.match(element, /target="_blank"/);
    assert.match(element, /rel="noopener noreferrer"/);
  }
});

test("documentation pages have unique ids and valid internal links", async () => {
  const pages = new Map();
  for (const file of docs) pages.set(file, await read(`docs/${file}`));

  for (const [file, html] of pages) {
    assert.match(html, /data-doc-search/);
    assert.match(html, /data-reading-progress/);
    assert.match(html, /href="\.\.\/index\.html"/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} contiene IDs duplicados`);

    for (const match of html.matchAll(/\bhref="([^"]+)"/g)) {
      const href = match[1];
      if (/^(https?:|mailto:)/.test(href) || href === "../index.html") continue;
      const [targetFileRaw, hash] = href.split("#");
      if (targetFileRaw.endsWith(".css")) continue;
      const targetFile = targetFileRaw || file;
      assert.ok(pages.has(targetFile), `${file}: destino local inexistente ${href}`);
      if (hash) {
        assert.ok(idsIn(pages.get(targetFile)).has(hash), `${file}: fragmento inexistente ${href}`);
      }
    }
  }
});
