import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { PUBLIC_PAGES } from "../scripts/build-languages.mjs";

test("every public language variant loads GTM once and retains existing dataLayer events", async () => {
  for (const prefix of ["", "en/"]) {
    for (const page of PUBLIC_PAGES) {
      const path = `${prefix}${page}`;
      const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
      const scripts = [...head.matchAll(/<!-- Google Tag Manager -->\s*<script>([\s\S]*?)<\/script>/g)];
      assert.equal(scripts.length, 1, path);
      assert(head.indexOf("<!-- Google Tag Manager -->") < head.indexOf("language.js"), path);
      assert.match(html, /<body\b[^>]*>\s*<!-- Google Tag Manager \(noscript\) -->\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-5245GRKX"\s+height="0" width="0" style="display:none;visibility:hidden"><\/iframe><\/noscript>/, path);
      assert.equal([...html.matchAll(/ns\.html\?id=GTM-5245GRKX/g)].length, 1, path);
      assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js/, path);

      const existingEvent = { event: "existing-event" };
      const window = { dataLayer: [existingEvent] };
      const inserted = [];
      const firstScript = { parentNode: { insertBefore(script, before) { assert.equal(before, firstScript); inserted.push(script); } } };
      const document = {
        getElementsByTagName(name) { assert.equal(name, "script"); return [firstScript]; },
        createElement(name) { assert.equal(name, "script"); return {}; },
      };
      runInNewContext(scripts[0][1], { window, document });
      assert.equal(window.dataLayer[0], existingEvent, path);
      assert.equal(window.dataLayer.length, 2, path);
      assert.equal(window.dataLayer[1].event, "gtm.js", path);
      assert.equal(typeof window.dataLayer[1]["gtm.start"], "number", path);
      assert.equal(inserted.length, 1, path);
      assert.equal(inserted[0].src, "https://www.googletagmanager.com/gtm.js?id=GTM-5245GRKX", path);
      assert.equal(inserted[0].async, true, path);
    }
  }
});
