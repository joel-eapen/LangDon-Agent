import {
    findUserById,
    listMessagesByLocalDate
} from "../db/repositories.js"
import asyncHandler from "../utils/async-handler.js";
import ApiError from "../utils/api-error.js";
import ApiResponse from "../utils/api-response.js";

const historyByDate = asyncHandler((req,res)=>{
    const{date} = req.query
    if(!date){
        throw new ApiError(400,"Invalid query params")
    }

    const {userId} = req.auth
    if(!userId){
        throw new ApiError(401,"Authentication is required",[],"AUTHENTICATION_REQUIRED")
    }

    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user is not found",[],"AUTHENTICATION_REQIURED")
    }

    const messages = listMessagesByLocalDate(userId,date)
    
})