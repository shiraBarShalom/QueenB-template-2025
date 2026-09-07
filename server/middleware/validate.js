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
