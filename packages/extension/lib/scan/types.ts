/**
 * What a scan of the page produces.
 *
 * Two vocabularies meet here and must not be confused:
 *
 *  - `FieldCategory` describes what a form field *is* ("this box wants a
 *    postcode"). It comes from the DOM and belongs to the page.
 *  - A `Fact.key` describes what we *store* ("personal.city"). It belongs to
 *    PERSONAL.md.
 *
 * They are deliberately different sets, bridged explicitly in bridge.ts. The
 * prior spike collapsed them, which is why it could not express "fill the first
 * name box from the full name I stored".
 */

export type FieldCategory =
  // Never filled, never captured.
  | "auth.password"
  | "auth.password.confirm"
  | "auth.username"
  | "financial.card.number"
  | "financial.card.expiry"
  | "financial.card.cvv"
  | "file.upload"
  // Identity
  | "personal.email"
  | "personal.phone"
  | "personal.name.first"
  | "personal.name.last"
  | "personal.name.full"
  | "personal.birthdate"
  | "personal.gender"
  | "personal.nif"
  | "personal.ssn"
  | "personal.nationality"
  // Address
  | "address.street"
  | "address.street2"
  | "address.city"
  | "address.state"
  | "address.zip"
  | "address.country"
  // Work and applications
  | "work.company"
  | "work.title"
  | "work.years_experience"
  | "work.notice_period"
  | "work.salary_expectation"
  | "work.availability"
  | "work.authorisation"
  | "work.remote_preference"
  | "languages.spoken"
  | "education.level"
  | "education.field"
  | "education.institution"
  | "financial.iban"
  | "web.url"
  | "web.linkedin"
  // Prose
  | "open.question"
  | "consent.checkbox"
  | "unknown";

export type FormPurpose =
  | "login"
  | "registration"
  | "contact"
  | "checkout"
  | "search"
  | "tax"
  | "job_application"
  | "survey"
  | "profile"
  | "unknown";

export interface SelectOption {
  value: string;
  text: string;
}

/** A field as scanned. `element` is dropped before crossing a message boundary. */
export interface ScannedField {
  /** Stable within a page: reused across re-scans of the same element. */
  id: string;
  element: HTMLElement;
  tag: "input" | "textarea" | "select";
  inputType: string;
  name: string;
  htmlId: string;
  label: string;
  /** Which strategy produced the label. Useful when a page fools the scanner. */
  labelSource: LabelSource;
  placeholder: string;
  autocomplete: string;
  ariaLabel: string;
  value: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  maxLength: number | null;
  /**
   * Computed, not filtered on. jsdom has no layout, so a scanner that dropped
   * invisible fields internally would be untestable. The content script filters.
   */
  visible: boolean;
  category: FieldCategory;
  confidence: number;
  /** Radios and checkboxes sharing a name are one logical question. */
  group: string | null;
  options?: SelectOption[];
}

export type LabelSource =
  | "label[for]"
  | "wrapping-label"
  | "aria-labelledby"
  | "aria-label"
  | "fieldset-legend"
  | "table-cell"
  | "preceding-text"
  | "placeholder"
  | "none";

export type SerializableField = Omit<ScannedField, "element">;

export interface ScanResult {
  url: string;
  domain: string;
  title: string;
  purpose: FormPurpose;
  fields: SerializableField[];
}

export const stripElement = (f: ScannedField): SerializableField => {
  const { element: _element, ...rest } = f;
  return rest;
};
