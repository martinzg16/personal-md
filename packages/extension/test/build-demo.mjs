/**
 * Assemble the public demo into one self-contained HTML file.
 *
 * Two properties the output must have. It is entirely inline - the artifact host
 * blocks external requests except fonts - and it is ASCII-only, because the host
 * owns <head> so there is no way to declare a charset and a wrong guess turns
 * every accented character in the Spanish fixtures into mojibake.
 *
 *   node test/build-demo.mjs   ->  test/personal-md-demo.html
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "pmd-demo-"));
const bundle = join(tmp, "demo.js");

execFileSync(
  join(here, "../../../node_modules/.bin/esbuild"),
  [
    join(here, "widget-demo.tsx"),
    "--bundle",
    "--minify",
    // Escapes every non-ASCII character, which is what makes the output
    // charset-independent.
    "--charset=ascii",
    "--format=iife",
    "--platform=browser",
    "--jsx=automatic",
    `--outfile=${bundle}`,
  ],
  { stdio: "inherit" },
);

const template = readFileSync(join(here, "demo-page.template.html"), "utf8");
const css = readFileSync(join(here, "widget.css"), "utf8");
const js = readFileSync(bundle, "utf8");

if (js.toLowerCase().includes("</script")) {
  throw new Error("the bundle contains a script-closing sequence and would break the page");
}

const ascii = [...template]
  .map((c) => (c.codePointAt(0) > 127 ? `&#${c.codePointAt(0)};` : c))
  .join("");

const out = ascii
  .replace("/* __WIDGET_CSS__ */", css)
  .replace("/* __WIDGET_JS__ */", js);

if ([...out].some((c) => c.codePointAt(0) > 127)) {
  throw new Error("output is not ASCII-only");
}

const dest = join(here, "personal-md-demo.html");
writeFileSync(dest, out);
console.log(`built ${dest} (${Math.round(out.length / 1024)} kB)`);
