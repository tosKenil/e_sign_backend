const express = require("express");
const route = express.Router();
const s3eSignController = require("../controller/s3eSignController");
const webhookController = require("../controller/webhookController");
const verification = require("../middleware/helper.js");
const path = require("path");


route.post("/generate-template", s3eSignController.generate_template);
route.get("/envelopes/by-token", verification.verifyJWT, s3eSignController.readEnvelopeByToken);
route.post("/envelopes/complete", verification.verifyJWT, s3eSignController.completeEnvelope);
route.post("/envelopes/cancel", verification.verifyJWT, s3eSignController.cancelEnvelope);
route.post("/envelopeDetails",  s3eSignController.envelopeDetails);
route.post("/uploadImg", s3eSignController.uploadImg);

route.post("/webhookRegister", webhookController.registerWebhook);

module.exports = route;