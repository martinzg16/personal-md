/**
 * The MRZ is the surface's completeness meter, so a wrong check digit is not a
 * cosmetic bug: it is the page claiming a verification it did not do.
 *
 * The check-digit cases are the ICAO 9303 specimen line, which is the only test
 * vector for this algorithm anybody should be using.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORITY,
  DOC_CODE,
  LINE_LENGTH,
  checkDigit,
  documentNumber,
  encodeMrz,
  extentField,
  nameField,
  transliterate,
} from "../lib/document/mrz.ts";

test("check digits match the ICAO 9303 specimen", () => {
  assert.equal(checkDigit("L898902C3"), "6");
  assert.equal(checkDigit("740812"), "2");
  assert.equal(checkDigit("120415"), "9");
  assert.equal(checkDigit("ZE184226B<<<<<"), "1");
  assert.equal(
    checkDigit("L898902C36" + "7408122" + "1204159" + "ZE184226B<<<<<1"),
    "0",
  );
});

test("an all-filler span checks as zero rather than throwing", () => {
  assert.equal(checkDigit("<<<<<<"), "0");
  assert.equal(checkDigit(""), "0");
});

test("a Spanish name files under both surnames, not the last word", () => {
  // The failure this guards against is filing `Martin Zulueta Ochoa` as OCHOA,
  // which is what a "last token is the surname" rule would do.
  assert.equal(
    nameField("Martin Zulueta Ochoa", 39),
    "ZULUETA<OCHOA<<MARTIN<<<<<<<<<<<<<<<<<<",
  );
  assert.equal(nameField("Ada Lovelace", 20), "LOVELACE<<ADA<<<<<<<");
});

test("the tilde survives transliteration as the standard requires", () => {
  assert.equal(transliterate("Muñoz"), "MUNXXOZ");
  assert.equal(transliterate("Núñez"), "NUNXXEZ");
  assert.equal(transliterate("Ángel"), "ANGEL");
});

test("an empty name yields a well-formed, entirely empty line", () => {
  const mrz = encodeMrz({
    fullName: "",
    language: null,
    firstRecordedAt: null,
    revisedAt: null,
    facts: 0,
    answers: 0,
    words: 0,
  });
  assert.equal(mrz.line1.length, LINE_LENGTH);
  assert.equal(mrz.line2.length, LINE_LENGTH);
  assert.equal(mrz.line1.startsWith(`${DOC_CODE}${AUTHORITY}`), true);
  assert.equal(mrz.filled, 0);
});

test("the document number is stable and never leaks a timestamp", () => {
  const a = documentNumber("Martin Zulueta");
  const b = documentNumber("Martin Zulueta");
  assert.equal(a, b);
  assert.equal(a.length, 9);
  assert.notEqual(a, documentNumber("Martin Zuluetb"));
});

test("the sex position stays filler even on a full document", () => {
  const mrz = encodeMrz({
    fullName: "Martin Zulueta",
    language: "spa",
    firstRecordedAt: new Date("2026-01-04T00:00:00Z"),
    revisedAt: new Date("2026-08-22T00:00:00Z"),
    facts: 21,
    answers: 8,
    words: 1240,
  });
  assert.equal(mrz.line2[20], "<");
  assert.equal(mrz.filled, 1);
});

test("every line stays exactly forty-four characters as it fills", () => {
  for (const facts of [0, 1, 21, 999, 4000]) {
    const mrz = encodeMrz({
      fullName: "A Very Long Compound Name Indeed Beyond The Field",
      language: "eng",
      firstRecordedAt: new Date("2026-01-04T00:00:00Z"),
      revisedAt: new Date("2026-08-22T00:00:00Z"),
      facts,
      answers: 8,
      words: 120000,
    });
    assert.equal(mrz.line1.length, LINE_LENGTH);
    assert.equal(mrz.line2.length, LINE_LENGTH);
  }
});

test("the extent slot is filler until there is something to measure", () => {
  assert.equal(extentField(0, 0, 0), "<".repeat(14));
  assert.equal(extentField(21, 8, 1240), "F021A08W01240<");
  assert.equal(extentField(21, 8, 1240).length, 14);
});

test("completeness is per field, so a short name is not an empty document", () => {
  const base = {
    language: "spa" as const,
    firstRecordedAt: new Date("2026-01-04T00:00:00Z"),
    revisedAt: new Date("2026-08-22T00:00:00Z"),
    facts: 21,
    answers: 8,
    words: 1240,
  };
  assert.equal(encodeMrz({ ...base, fullName: "Ada Byron" }).filled, 1);
  assert.equal(
    encodeMrz({ ...base, fullName: "A Considerably Longer Name" }).filled,
    1,
  );
  // And a name alone is one field of five, not a finished line.
  assert.equal(
    encodeMrz({
      fullName: "Ada Byron",
      language: null,
      firstRecordedAt: null,
      revisedAt: null,
      facts: 0,
      answers: 0,
      words: 0,
    }).filled,
    0.2,
  );
});
