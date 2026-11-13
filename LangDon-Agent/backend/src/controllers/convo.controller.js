import asyncHandler from "../utils/async-handler.js";
import ApiError from "../utils/api-error.js";
import ApiResponse from "../utils/api-response.js";

const createConvo = asyncHandler(async(req,res)=>{
    const {title,timeZone} = req.body

})