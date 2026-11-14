import {
    verifyConversationOwnership,
    findUserById,
    insertMessage,
    listMessagesByConversation,
    countMessagesByConversation,
    findMessageById,
} from "../db/repositories.js";
import asyncHandler from "../utils/async-handler.js";
import ApiError from "../utils/api-error.js";
import ApiResponse from "../utils/api-response.js";

const addMessage = asyncHandler((req,res)=>{
    const{role,content,turnId} = req.body
    const{id}=req.params
    if(!id){
        throw new ApiError(401,"Conversation ID is not given",[])
    }
    const {userId} = req.auth
    if(!userId){
        throw new ApiError(401,"Authentication Required",[],"AUTHENTICATION_REQUIRED")
    }
    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user is not found",[],"AUTHENTICATION_REQUIRED")
    }

    const isOwner = verifyConversationOwnership(userId,id)
    if(!isOwner){
        throw new ApiError(403,"Forbidden, this message is not accessible by you",[],"FORBIDDEN")
    }

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const addMessage = insertMessage({id,userId,turnId,role,content,userTimeZone})
    if(!insertMessage){
        throw new ApiError(404,"Insertion of message failed",[])
    }

    return res.json(new ApiResponse(200,{addMessage},"Insertion of message has been successful"))
});

const getAllMessages = asyncHandler((req,res)=>{
    const { page, limit } = req.query;
    const pageNumber = page === undefined ? 1 : Number(page);
    const limitNumber = limit === undefined ? 5 : Number(limit);

    if(!Number.isInteger(pageNumber) || !Number.isInteger(limitNumber)
        || pageNumber <= 0 || limitNumber <= 0){
        throw new ApiError(400,"The query params are out of bound",[],"OUT_OF_BOUND")
    }

    const offset = (pageNumber-1)*limitNumber

    const{id}=req.params
    if(!id){
        throw new ApiError(401,"Conversation ID is not provided",[])
    }

    const {userId} = req.auth
    if(!userId){
        throw new ApiError(401,"Authentication Required",[],"AUTHENTICATION_REQUIRED")
    }
    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user is not found",[],"AUTHENTICATION_REQUIRED")
    }

    const isOwner = verifyConversationOwnership(userId,id)
    if(!isOwner){
        throw new ApiError(403,"Forbidden, this message is not accessible by you",[],"FORBIDDEN")
    }


    const allMessages = listMessagesByConversation(id,{limit:limitNumber,offset})
    const total = countMessagesByConversation(id)

    return res.json(new ApiResponse(200,{
        messages:allMessages,
        pagination:{
            page:pageNumber,
            limit:limitNumber,
            total
        }
    },"Messages have been retrived sucessfully"))

});

const getOneMessage = asyncHandler((req,res)=>{
    const {id} = req.params
    if(!id){
        throw new ApiError(401,"Conversation ID is not given",[])
    }

    const {userId} = req.auth
    if(!userId){
        throw new ApiError(401,"Authentication Required",[],"AUTHENTICATION_REQUIRED")
    }
    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user is not found",[],"AUTHENTICATION_REQUIRED")
    }

    const message = findMessageById(id)
    if(!message){
        throw new ApiError(404,"Message is unavailable",[],"MESSAGE_NOT_FOUND")
    }

    const conversation_id = message?.conversation_id

    const isOwner = verifyConversationOwnership(userId,conversation_id)
    if(!isOwner){
        throw new ApiError(403,"Forbidden, this message is not accessible by you",[],"FORBIDDEN")
    }

    return res.json(new ApiResponse(200,{
        content:message.content,
        role:message.role,
        ts_utc:message.ts_uts,
        timezone:message.timezone,
        local_date:message/local_date
    },'Message retrived successfully'))

});

export {
    addMessage,
    getAllMessages,
    getOneMessage
}