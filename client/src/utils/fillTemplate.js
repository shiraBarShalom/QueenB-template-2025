/**
 * Replace every `{key}` placeholder in a template string with values[key].
 * Used for i18n strings that carry a name / count / date, e.g.
 *   fillTemplate("Propose times for {name}", { name: "Shira" })
 */
export default function fillTemplate(template, values = {}) {
  return Object.keys(values).reduce(
    (out, key) => out.split(`{${key}}`).join(String(values[key])),
    String(template)
  );
}
