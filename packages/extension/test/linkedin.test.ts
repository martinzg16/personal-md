/**
 * Reading a LinkedIn profile the user is looking at.
 *
 * Two things carry real weight here. It must refuse a profile that is not the
 * user's own, because filing a stranger's employment history is not a feature.
 * And it must survive LinkedIn's habit of rendering every visible string twice -
 * once for sighted users and once aria-hidden - which naive textContent turns
 * into "MadridMadrid".
 */

import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { describe, it } from "node:test";

import {
  extractLinkedInProfile,
  isEmptyProfile,
  isOwnProfile,
  isProfilePage,
} from "../lib/linkedin/extract.ts";

/** LinkedIn doubles visible strings; this mirrors that shape. */
const doubled = (text: string) =>
  `<span aria-hidden="true">${text}</span><span class="visually-hidden">${text}</span>`;

const OWN_PROFILE = `
<main>
  <section class="top-card">
    <h1>${doubled("Martin Zulueta Garcia")}</h1>
    <div class="text-body-medium break-words">${doubled("Product Manager at TaxDown")}</div>
    <span class="text-body-small inline">${doubled("Madrid, Community of Madrid, Spain")}</span>
    <button aria-label="Edit intro">Edit</button>
  </section>

  <section>
    <div id="about"></div>
    <h2>${doubled("About")}</h2>
    <div><div class="inline-show-more-text">${doubled(
      "I spend my days deciding which tax problems are worth solving for 300,000 people, which mostly means saying no.",
    )}</div></div>
  </section>

  <section>
    <div id="experience"></div>
    <h2>${doubled("Experience")}</h2>
    <div><ul>
      <li data-view-name="profile-component-entity">
        <span>${doubled("Product Manager")}</span>
        <span>${doubled("TaxDown")}</span>
        <span>${doubled("Jan 2022 - Present")}</span>
        <span>${doubled(
          "Led the migration of the investor flow. Review time went from 2.41 days per case to 1.10, and the queue went from 13 people to 6.",
        )}</span>
      </li>
    </ul></div>
  </section>

  <section>
    <div id="education"></div>
    <h2>${doubled("Education")}</h2>
    <div><ul>
      <li data-view-name="profile-component-entity">
        <span>${doubled("Universidad Carlos III de Madrid")}</span>
        <span>${doubled("Bachelor's degree, Business Administration")}</span>
      </li>
    </ul></div>
  </section>

  <section>
    <div id="skills"></div>
    <h2>${doubled("Skills")}</h2>
    <div><ul>
      <li data-view-name="profile-component-entity"><span>${doubled("Product Management")}</span></li>
      <li data-view-name="profile-component-entity"><span>${doubled("SQL")}</span></li>
    </ul></div>
  </section>
</main>`;

const docOf = (html: string) =>
  new JSDOM(`<html lang="en"><body>${html}</body></html>`, {
    url: "https://www.linkedin.com/in/martinzulueta/",
  }).window.document;

describe("recognising a profile page", () => {
  it("accepts a profile URL, on any subdomain", () => {
    assert.equal(isProfilePage("https://www.linkedin.com/in/martinzulueta/"), true);
    assert.equal(isProfilePage("https://linkedin.com/in/someone-else"), true);
    assert.equal(isProfilePage("https://es.linkedin.com/in/alguien/"), true);
  });

  it("rejects everything else on the site", () => {
    for (const url of [
      "https://www.linkedin.com/feed/",
      "https://www.linkedin.com/jobs/view/12345",
      "https://www.linkedin.com/company/taxdown/",
      "https://example.com/in/martinzulueta",
    ]) {
      assert.equal(isProfilePage(url), false, url);
    }
  });
});

describe("refusing someone else's profile", () => {
  it("recognises the user's own profile from an edit affordance", () => {
    assert.equal(isOwnProfile(docOf(OWN_PROFILE)), true);
  });

  it("refuses a profile with no own-profile affordances", () => {
    // The same markup with the edit control removed is a stranger's page. This
    // must fail closed: "it was on screen" is not consent.
    const stranger = OWN_PROFILE.replace('<button aria-label="Edit intro">Edit</button>', "");
    assert.equal(isOwnProfile(docOf(stranger)), false);
  });

  it("does not infer ownership from the URL", () => {
    const bare = docOf("<main><h1>Someone Else</h1></main>");
    assert.equal(isOwnProfile(bare), false);
  });
});

describe("extracting the profile", () => {
  const p = extractLinkedInProfile(docOf(OWN_PROFILE), "https://www.linkedin.com/in/martinzulueta/");

  it("reads each field once, not twice", () => {
    // The bug this guards: aria-hidden duplication turning every value into
    // "MadridMadrid".
    assert.equal(p.name, "Martin Zulueta Garcia");
    assert.equal(p.headline, "Product Manager at TaxDown");
    assert.equal(p.location, "Madrid, Community of Madrid, Spain");
  });

  it("keeps the About prose intact, as a voice exemplar", () => {
    assert.ok(p.about?.startsWith("I spend my days deciding"));
    assert.ok(p.about?.includes("300,000"), "figures must survive verbatim");
    assert.ok(!p.about?.includes("I spend my days deciding which tax problems are worth solving for 300,000 people, which mostly means saying no.I spend"));
  });

  it("reads a position with its description", () => {
    assert.equal(p.positions.length, 1);
    assert.equal(p.positions[0]?.title, "Product Manager");
    assert.equal(p.positions[0]?.company, "TaxDown");
    assert.equal(p.positions[0]?.dates, "Jan 2022 - Present");
    // The user's own numbers, which are what makes a draft grounded.
    assert.ok(p.positions[0]?.description?.includes("2.41"));
  });

  it("reads education and skills", () => {
    assert.equal(p.education[0]?.school, "Universidad Carlos III de Madrid");
    assert.match(p.education[0]?.credential ?? "", /Business Administration/);
    assert.deepEqual(p.skills, ["Product Management", "SQL"]);
  });

  it("reports what it could not read instead of claiming success", () => {
    // A page missing its About and Skills sections must say so, or the user has
    // no way to know the import was partial.
    const stripped = OWN_PROFILE.replace(/<div id="about"><\/div>/, "").replace(
      /<div id="skills"><\/div>/,
      "",
    ).replace(/<h2><span aria-hidden="true">About<\/span>[\s\S]*?<\/h2>/, "")
     .replace(/<h2><span aria-hidden="true">Skills<\/span>[\s\S]*?<\/h2>/, "");
    const partial = extractLinkedInProfile(docOf(stripped), "https://www.linkedin.com/in/x/");
    assert.ok(partial.warnings.length > 0, "a partial read must warn");
  });

  it("calls a page with nothing on it empty, rather than importing blanks", () => {
    const empty = extractLinkedInProfile(docOf("<main><h1>Nobody</h1></main>"), "https://www.linkedin.com/in/x/");
    assert.equal(isEmptyProfile(empty), true);
    assert.equal(isEmptyProfile(p), false);
  });
});
