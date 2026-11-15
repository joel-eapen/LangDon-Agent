import { randomUUID } from "node:crypto";
import {
    createConversation,
    findUserById,
    listConversations,
    findConversationSummaryById,
    countConversations,
    verifyConversationOwnership,
    updateConversationTitle,
    deleteConversation
} from "../db/repositories.js";
import asyncHandler from "../utils/async-handler.js";
import ApiError from "../utils/api-error.js";
import ApiResponse from "../utils/api-response.js";
import { getConversationSearches } from "../services/conversation-search.service.js";

const createConvo = asyncHandler((req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        throw new ApiError(401, "Authentication required", [], "AUTHENTICATION_REQUIRED");
    }

    const user = findUserById(userId);
    if (!user) {
        throw new ApiError(401, "Authenticated user was not found", [], "INVALID_AUTHENTICATION");
    }

    const conversation = createConversation({
        id: randomUUID(),
        userId: user.id,
        title: req.body.title,
    });

    return res.status(201).json(new ApiResponse(201, {
        conversation,
        timezone: req.body.timeZone,
    }, "Conversation created"));
});

const getAllConvo = asyncHandler((req,res)=>{
    const { page, limit } = req.query;
    const pageNumber = page === undefined ? 1 : Number(page);
    const limitNumber = limit === undefined ? 5 : Number(limit);

    if(!Number.isInteger(pageNumber) || !Number.isInteger(limitNumber)
        || pageNumber <= 0 || limitNumber <= 0){
        throw new ApiError(400,"The query params are out of bound",[],"OUT_OF_BOUND")
    }

    const offset = (pageNumber-1)*limitNumber
    const userId = req.auth?.userId
    if(!userId){
        throw new ApiError(401,"Authentication required",[],"AUTHENTICATION_REQUIRED")
    }

    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user was not found",[],"AUTHENTICATION_REQUIRED")
    }

    const conversations = listConversations(userId, { limit: limitNumber, offset });
    const total = countConversations(userId);

    return res.json(new ApiResponse(200,{
            conversations,
            pagination:{
                page:pageNumber,
                limit:limitNumber,
                total
            }
        },'Conversations fetched successfully'))
});

const getOneConvo = asyncHandler((req,res)=>{
    const {userId} = req.auth
    const{id}=req.params
    if(!id){
        throw new ApiError(401,"Conversation ID is not given",[])
    }
    if(!userId){
        throw new ApiError(401,"Authentication required",[],"AUTHENTICATION_REQUIRED")
    }

    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user is not found",[],"AUTHENTICATIO_REQUIRED")
    }

    //Ownership checks
    const isOwner = verifyConversationOwnership(userId,id)
    if(!isOwner){
        throw new ApiError(403,"This conversation is not accessible by you",[],"FORBIDDEN")
    }

    const conversation = findConversationSummaryById(id)
    if(!conversation){
        throw new ApiError(404,"No conversation with this ID is found",[],"NOT_FOUND")
    }

    return res.json(new ApiResponse(200,{
        metadata:{
            title:conversation.title,
            created_at:conversation.created_at,
            updated_at:conversation.updated_at,
            last_message_at:conversation.last_message_at,
            message_count:conversation.message_count
        }
    },"Converstaion metadata returned successfully"))
});

const getConversationSearchHistory = asyncHandler((req, res) => {
    const data = getConversationSearches({
        userId: req.auth?.userId,
        conversationId: req.params.id,
        page: req.query.page,
        limit: req.query.limit,
    });

    return res.json(new ApiResponse(200, data, "Conversation searches retrieved successfully"));
});

const updateTitle = asyncHandler((req,res)=>{
    const {title} = req.body
    const {userId} = req.auth
    const {id} =req.params
    if(!id){
        throw new ApiError(401,"Conversation ID is not given",[])
    }
    if(!userId){
        throw new ApiError(401,"Authentication Required",[],"AUTHENTICATION_REQUIRED")
    }

    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user not found",[],"AUTHENTICATION_REQUIRED")
    }


    const isOwner = verifyConversationOwnership(userId,id)
    if(!isOwner){
        throw new ApiError(403,"This conversation is not accessible by you",[],"FORBIDDEN")
    }

    const conversation = updateConversationTitle(id, title);
    if(!conversation){
        throw new ApiError(404,"No conversation with this ID is found",[],"NOT_FOUND")
    }

    return res.json(new ApiResponse(200, {
        conversation,
    }, "Conversation title updated successfully"));
});

const deleteConvo = asyncHandler((req,res)=>{
    const {userId} = req.auth
    const {id} =req.params
    if(!id){
        throw new ApiError(401,"Conversation ID is not given",[])
    }
    if(!userId){
        throw new ApiError(401,"Authentication Required",[],"AUTHENTICATION_REQUIRED")
    }

    const user = findUserById(userId)
    if(!user){
        throw new ApiError(401,"Authenticated user not found",[],"AUTHENTICATION_REQUIRED")
    }


    const isOwner = verifyConversationOwnership(userId,id)
    if(!isOwner){
        throw new ApiError(403,"This conversation is not accessible by you",[],"FORBIDDEN")
    }

    const isDeleted = deleteConversation(id)

    if(!isDeleted){
        throw new ApiError(404,"The conversation does not exists to be deleted",[],"NOT_FOUND")
    }

    return res.json(new ApiResponse(204,{
        isConversationDeleted:isDeleted
    },"Conversation has been deleted successfully"))
});



export {
    createConvo,
    getAllConvo,
    getOneConvo,
    getConversationSearchHistory,
    updateTitle,
    deleteConvo
};