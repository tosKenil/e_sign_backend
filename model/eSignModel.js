const mongoose = require("mongoose");
const { SIGN_EVENTS } = require("../contance.js");


const originalFileSchema = new mongoose.Schema(
    {
        filename: String,
        storedName: String,
        publicUrl: String,
        mimetype: String,
        html: String, // ⭐ NEW: full HTML content
    },
    { _id: false }
);

const signerSchema = new mongoose.Schema(
    {
        email: { type: String, required: true },
        name: { type: String, default: "" },
        status: {
            type: String,
            enum: [
                SIGN_EVENTS.PENDING,
                SIGN_EVENTS.SENT,
                SIGN_EVENTS.DELIVERED,
                SIGN_EVENTS.COMPLETED,
                SIGN_EVENTS.VOIDED,
            ],
            default: SIGN_EVENTS.PENDING,
        },
        sentAt: Date,
        deliveredAt: Date,
        completedAt: Date,
        signedUrl: String,
        tokenUrl: String,
    },
    { _id: false }
);

const envelopeSchema = new mongoose.Schema(
    {
        signers: [signerSchema],
        documentStatus: {
            type: String,
            enum: [
                SIGN_EVENTS.PENDING,
                SIGN_EVENTS.SENT,
                SIGN_EVENTS.DELIVERED,
                SIGN_EVENTS.VOIDED,
                SIGN_EVENTS.COMPLETED,
            ],
            default: SIGN_EVENTS.PENDING,
        },
        files: [originalFileSchema],
        pdf: { type: String, default: "" },
        signedPdf: { type: String, default: "" }, // final merged/fully-signed pdf (optional)
        signedUrl: { type: String, default: "" }, // convenience: first signer link
    },
    { collection: "envelope", timestamps: true }
);

const Envelope = mongoose.model("envelope", envelopeSchema);

module.exports = Envelope 