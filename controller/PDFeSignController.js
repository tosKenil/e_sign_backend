const PDFeSignController = {};
const fs = require("fs");
const path = require("path");
const sendMail = require("../services/sendmail.js");
const { SIGN_EVENTS, DIRECTORIES, ESIGN_PATHS, userId, STATICUSERID } = require("../config/contance.js");
const Envelope = require("../model/eSignModel");
const jwt = require("jsonwebtoken");
const { addHeaderToPdf, getCurrentDayInNumber, getCurrentMOnth, getCurrentYear, triggerWebhookEvent, setEnvelopeData } = require("../middleware/helper");
const { PDFDocument } = require("pdf-lib");

const AwsFileUpload = require("../services/s3Upload"); // <-- change path as per your project
const signatureModel = require("../model/signatureModel.js");

const { JWT_SECRET, BASE_URL, SPACES_PUBLIC_URL } = process.env;


const ESIGN_ORIGINALS_PATH = ESIGN_PATHS.ESIGN_ORIGINALS_PATH;
const ESIGN_PDF_PATH = ESIGN_PATHS.ESIGN_PDF_PATH;
const ESIGN_SIGNED_PATH = ESIGN_PATHS.ESIGN_SIGNED_PATH;

PDFeSignController.storePdf = async (req, res) => {
    try {
        const { base64, userData } = req.body;

        // ------------------ Parse templates (array of objects) ------------------
        let templates = [];
        try {
            templates = Array.isArray(base64) ? base64 : JSON.parse(base64);
        } catch {
            return res.status(400).json({ error: "base64 must be a valid array" });
        }

        if (!templates.length) {
            return res.status(400).json({ error: "At least one PDF template required in base64" });
        }

        // validate template items
        templates = templates
            .map((t, idx) => ({
                name: (t?.name || `Document-${idx + 1}`).toString(),
                documentBase64: (t?.documentBase64 || "").toString(),
            }))
            .filter((t) => !!t.documentBase64);

        if (!templates.length) {
            return res.status(400).json({ error: "base64 items must contain documentBase64" });
        }

        // ------------------ Parse user data ------------------
        let users = [];
        try {
            users = Array.isArray(userData) ? userData : JSON.parse(userData);
        } catch {
            return res.status(400).json({ error: "userData must be a valid array" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        users = users
            .map((u) => ({
                name: u.name?.trim() || "",
                email: u.email?.trim()?.toLowerCase(),
            }))
            .filter((u) => u.email && emailRegex.test(u.email));

        if (!users.length) {
            return res.status(400).json({ error: "Invalid userData format" });
        }

        // ------------------ Convert base64 -> buffers + upload each PDF ------------------
        const files = [];
        const pdfBuffers = [];

        for (let i = 0; i < templates.length; i++) {
            const { documentBase64, name } = templates[i];

            // accept:
            // - pure base64
            // - data:application/pdf;base64,...
            const cleanBase64 = String(documentBase64 || "")
                .replace(/^data:application\/pdf;base64,/i, "")
                .trim();

            if (!cleanBase64) {
                console.warn(`PDF index ${i} is empty, skipping.`);
                continue;
            }

            let pdfBuffer;
            try {
                pdfBuffer = Buffer.from(cleanBase64, "base64");
            } catch (e) {
                console.warn(`PDF index ${i} invalid base64, skipping.`);
                continue;
            }

            // quick validation: PDF header usually starts with %PDF
            const header = pdfBuffer.slice(0, 4).toString("utf8");
            if (header !== "%PDF") {
                console.warn(`PDF index ${i} does not look like a valid PDF, skipping.`);
                continue;
            }

            pdfBuffers.push(pdfBuffer);

            const baseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-pdf-${i + 1}`;
            const pdfFileName = `${baseName}.pdf`;

            // Upload each original PDF
            await AwsFileUpload.uploadToSpaces({
                fileData: pdfBuffer,
                filename: pdfFileName,
                filepath: ESIGN_PDF_PATH,
                mimetype: "application/pdf",
            });

            // Store per-file meta
            files.push({
                filename: name,               // 👈 document name from payload
                storedName: pdfFileName,      // key/name stored in spaces
                publicUrl: pdfFileName,       // if you store only key (frontend can build URL)
                mimetype: "application/pdf",
                html: documentBase64,

                templatePdf: pdfFileName,     // keep your existing schema compatibility
                signedTemplatePdf: null,
            });
        }

        if (!files.length || !pdfBuffers.length) {
            return res.status(400).json({ error: "No valid PDFs after processing" });
        }

        // ------------------ Merge PDFs ------------------
        const mergedPdf = await PDFDocument.create();

        for (const buf of pdfBuffers) {
            const pdf = await PDFDocument.load(buf);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((p) => mergedPdf.addPage(p));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const mergedBaseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-merged`;
        const mergedPdfFileName = `${mergedBaseName}.pdf`;
        const mergedKey = mergedPdfFileName;

        // ------------------ Setup envelope & signers ------------------
        const now = new Date();
        const signers = users.map((u) => ({
            email: u.email,
            name: u.name,
            status: SIGN_EVENTS.SENT,
            sentAt: now,
            tokenUrl: "",
        }));

        let env = await Envelope.create({
            signers,
            files,
            documentStatus: SIGN_EVENTS.SENT,
            pdf: mergedKey, // merged pdf key (header will be applied after env._id created)
            signedPdf: "",
            tokenUrl: "",
            contentType: "application/pdf",
        });

        // ------------------ Add header with Envelope ID to every page ------------------
        const finalMergedBytes = await addHeaderToPdf(mergedPdfBytes, env._id);

        // ------------------ Upload final merged PDF (with header) ------------------
        const mergedUploadResult = await AwsFileUpload.uploadToSpaces({
            fileData: finalMergedBytes,
            filename: mergedPdfFileName,
            filepath: ESIGN_PDF_PATH,
            mimetype: "application/pdf",
        });

        const mergedPublicUrl =
            mergedUploadResult?.publicUrl ||
            mergedUploadResult?.Location ||
            `${ESIGN_PDF_PATH}/${mergedPdfFileName}`;

        // if your schema supports it
        env.pdf = mergedKey;
        env.pdfUrl = mergedPublicUrl; // remove if field doesn't exist

        // ------------------ Generate token URLs and save env ------------------
        const signerResults = [];
        for (let i = 0; i < env.signers.length; i++) {
            const s = env.signers[i];
            const token = jwt.sign({ envId: String(env._id), email: s.email, i }, JWT_SECRET);
            const signUrl = `${process.env.SIGNING_WEB_URL}?type=${token}`;

            env.signers[i].tokenUrl = signUrl;
            signerResults.push({ email: s.email, name: s.name, tokenUrl: signUrl });
        }

        env.tokenUrl = signerResults[0]?.tokenUrl || "";
        await env.save();

        const setEnv = await setEnvelopeData(env._id, SIGN_EVENTS.SENT);
        await triggerWebhookEvent(SIGN_EVENTS.SENT, STATICUSERID, setEnv);

        // ------------------ Load email template HTML ------------------
        const templatePath = path.join(__dirname, "../public/template/sendDocument.html");
        const emailTemplateRaw = fs.readFileSync(templatePath, "utf8");

        // ------------------ Send Emails ------------------
        await Promise.all(
            signerResults.map(async ({ email, name, tokenUrl }) => {
                const firstFile = files[0];
                const docName = firstFile?.filename || "Document";

                const emailHtml = emailTemplateRaw
                    .replace(/{{name}}/g, name || "")
                    .replace(/{{signUrl}}/g, tokenUrl)
                    .replace(/{{DocumentName}}/g, docName);

                const subject = "Please sign the documents";
                await sendMail(email, subject, emailHtml);
            })
        );

        return res.json({
            status: true,
            message: "emails sent successfully",
            envelopeId: String(env._id),
            // files, // enable if you want
            // mergedPdfUrl: mergedPublicUrl, // enable if you want
        });
    } catch (e) {
        console.error("🔥 Error in storePdf:", e);
        return res.status(500).json({ error: "Generation failed" });
    }
};




module.exports = PDFeSignController;