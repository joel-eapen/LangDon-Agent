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

    if (source === "query") {
        const query = req.query;
        for (const key of Object.keys(query)) {
            delete query[key];
        }
        Object.assign(query, result.data);
    } else {
        req[source] = result.data;
    }
    return next();
};

export default validate;
