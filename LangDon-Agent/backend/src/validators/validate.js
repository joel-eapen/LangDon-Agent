import ApiError from "../utils/api-error.js";

export const validate = (schema, source = "body") => (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        }));
        return next(new ApiError(400, "Validation failed", errors, "INVALID_REQUEST"));
    }

    req[source] = result.data;
    return next();
};

export default validate;
