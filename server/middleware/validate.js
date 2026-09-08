// Body validation via a zod schema. Ported from feature/mentorme-login-page.
// On failure it returns this project's standard { success, data, message }
// envelope (see utils/responseHandler) with field errors under data.fields, so
// the client's AuthPage can map them back onto individual inputs.
const { sendError } = require("../utils/responseHandler");

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const flattened = result.error.flatten();
      return sendError(res, "Please correct the highlighted fields", 400, {
        fields: flattened.fieldErrors,
        form: flattened.formErrors,
      });
    }
    req.validatedBody = result.data;
    return next();
  };
}

module.exports = { validateBody };
