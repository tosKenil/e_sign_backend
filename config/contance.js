module.exports.SIGN_EVENTS = {
    PENDING: 'pending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    AVOIDED: 'avoided',
    COMPLETED: 'completed',
}

module.exports.DIRECTORIES = {
    SIGNED_DIRECTORY: '/storage/signed/',
    PDF_DIRECTORY: '/storage/pdf/',
    ORIGINAL_DIRECTORY: '/storage/originals/',
}

module.exports.ESIGN_PATHS = {
    ESIGN_ORIGINALS_PATH: "originals/",
    ESIGN_PDF_PATH: "pdf/",
    ESIGN_SIGNED_PATH: "signed/",
}

module.exports.WEBHOOK_EVENTS = {
    ACTIVE: "active",
    PENDING: "pending",
    FAILED: "failed",
    COMPLETED: "completed",
}

module.exports.IS_ACTIVE_ENUM = {
    NEED_TO_SIGN: "needs_to_sign",
    NEED_TO_VIEW: "need_to_view",
    RECEIVE_COPY: "receive_copy",
}

module.exports.STATICUSERID = "692ea3cd6f5ab96d0d8afd6e"