const express = require("express");
const route = express.Router();
const multer = require("multer");
const eSignController = require("../controller/eSignController");
const verification = require("../middleware/helper.js");

const uploadSignedFile = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, SIGNED_DIR);
        },
        filename: (req, file, cb) => {
            const uniqueName = `${Date.now()}-${generateId()}.pdf`;
            cb(null, uniqueName);
        },
    }),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== ".pdf") return cb(new Error("Only PDF files allowed"));
        cb(null, true);
    },
});

route.post("/generate-template", uploadSignedFile.none(), eSignController.generate_template);
route.get("/envelopes/by-token", verification.verifyJWT, uploadSignedFile.none(), eSignController.readEnvelopeByToken);
route.post("/envelopes/complete", verification.verifyJWT, uploadSignedFile.none(), eSignController.completeEnvelope);
route.post("/envelopes/cancel", verification.verifyJWT, eSignController.cancelEnvelope);
// route.get("/sign", eSignController.serveSigningPage);

module.exports = route;