/**
 * Where the widget is allowed to run, and what it infers about a page.
 *
 * The sensitive-domain rule is the one with teeth: a panel offering to autofill
 * on a bank is at best noise and at worst dangerous, and the tool has nothing to
 * contribute there anyway.
 */

import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { describe, it } from "node:test";

import {
  detectPageLanguage,
  genreForPurpose,
  isSensitiveDomain,
  registerHintFor,
  shouldRun,
} from "../lib/policy.ts";

describe("domains the widget refuses to appear on", () => {
  for (const host of [
    "paypal.com",
    "www.paypal.com",
    "checkout.stripe.com",
    "revolut.com",
    "wise.com",
    "bbva.es",
    "www.santander.es",
    "coinbase.com",
    "binance.com",
  ]) {
    it(`stays off ${host}`, () => {
      assert.equal(isSensitiveDomain(host), true);
    });
  }

  it("catches a banking or payment subdomain it has never seen", () => {
    // A fixed blocklist cannot enumerate every bank, so the shape helps too.
    for (const host of [
      "banking.someregionalbank.co.uk",
      "pay.somemerchant.io",
      "checkout.someshop.de",
      "banca.otrobanco.es",
      "wallet.something.com",
    ]) {
      assert.equal(isSensitiveDomain(host), true, `${host} should be refused`);
    }
  });

  it("does not refuse an ordinary careers or government site", () => {
    for (const host of [
      "careers.example.com",
      "boards.greenhouse.io",
      "jobs.lever.co",
      "sede.agenciatributaria.gob.es",
      "example.com",
      // "company.com" contains no payment shape and must not trip the hints.
      "paypalternatives.example.com",
    ]) {
      assert.equal(isSensitiveDomain(host), false, `${host} should be allowed`);
    }
  });
});

describe("shouldRun", () => {
  it("runs on an ordinary http page", () => {
    assert.deepEqual(shouldRun("https://careers.example.com/apply", []), { run: true });
  });

  it("refuses a sensitive domain with a reason", () => {
    assert.deepEqual(shouldRun("https://www.paypal.com/checkout", []), {
      run: false,
      reason: "sensitive-domain",
    });
  });

  it("respects a per-site dismissal", () => {
    assert.deepEqual(shouldRun("https://careers.example.com/apply", ["careers.example.com"]), {
      run: false,
      reason: "dismissed",
    });
  });

  it("refuses anything that is not http", () => {
    for (const url of ["chrome://extensions", "file:///Users/x/form.html", "about:blank", "junk"]) {
      assert.equal(shouldRun(url, []).run, false, `${url} should be refused`);
    }
  });
});

describe("form purpose to answer genre", () => {
  it("maps a page kind onto the register an answer was written in", () => {
    assert.equal(genreForPurpose("job_application"), "job_application");
    // A tax form and a government survey want the same voice.
    assert.equal(genreForPurpose("tax"), "gov_survey");
    assert.equal(genreForPurpose("survey"), "survey");
    assert.equal(genreForPurpose("profile"), "profile");
    assert.equal(genreForPurpose("registration"), "personal_info");
    assert.equal(genreForPurpose("login"), "other");
    assert.equal(genreForPurpose("anything-unknown"), "other");
  });

  it("describes the form for the drafting prompt", () => {
    assert.equal(
      registerHintFor("job_application", "careers.example.com"),
      "job application on careers.example.com",
    );
    assert.match(registerHintFor("tax", "sede.agenciatributaria.gob.es"), /government tax form/);
  });
});

describe("form language detection", () => {
  const doc = (html: string) => new JSDOM(html).window.document;

  it("trusts a declared lang attribute", () => {
    assert.equal(detectPageLanguage(doc('<html lang="es"><body>whatever</body></html>')), "es");
    assert.equal(detectPageLanguage(doc('<html lang="en-GB"><body>lo que sea</body></html>')), "en");
  });

  it("judges from the text when nothing is declared", () => {
    // The form's language, not the browser's: an English-speaking user filling a
    // Spanish government form needs the Spanish answer.
    const es = doc(
      "<html><body><label>¿Cuál es su situación laboral?</label>" +
        "<p>Indique los datos para la declaración y por qué solicita esta ayuda.</p></body></html>",
    );
    const en = doc(
      "<html><body><label>What is your current role?</label>" +
        "<p>Please tell us about the work you have done with your team.</p></body></html>",
    );
    assert.equal(detectPageLanguage(es), "es");
    assert.equal(detectPageLanguage(en), "en");
  });

  it("falls back to the body when a form is built out of divs with no labels", () => {
    const divs = doc(
      "<html><body><div>¿Por qué te interesa esta posición?</div>" +
        "<div>Indique los datos para la declaración y por qué solicita la ayuda.</div></body></html>",
    );
    assert.equal(detectPageLanguage(divs), "es");
  });

  it("ignores script bodies, whose identifiers are always English", () => {
    // Without stripping scripts, a Spanish page with an English bundle inline
    // would be read as English.
    const withScript = doc(
      "<html><body><div>¿Cuál es su situación laboral y por qué solicita esta ayuda?</div>" +
        "<script>const what = 'the value for your form with which and from';</script></body></html>",
    );
    assert.equal(detectPageLanguage(withScript), "es");
  });

  it("falls back to English rather than throwing on an empty page", () => {
    assert.equal(detectPageLanguage(doc("<html><body></body></html>")), "en");
  });
});
