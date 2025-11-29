const eSignController = {};
const sendMail = require("../services/sendmail.js");
const { SIGN_EVENTS, DIRECTORIES, ESIGN_PATHS } = require("../config/contance.js");
const Envelope = require("../model/eSignModel");
const jwt = require("jsonwebtoken");
const { generatePdfDocumentFromTemplate, buildFullPdfHtml, getCurrentDayInNumber, getCurrentMOnth, getCurrentYear, normalizeIP } = require("../middleware/helper");
const { default: puppeteer } = require("puppeteer");
const chromium = require("@sparticuz/chromium");
const puppeteer_core = require("puppeteer-core");
const { PDFDocument } = require("pdf-lib");

const AwsFileUpload = require("../services/s3Upload"); // <-- change path as per your project

const { JWT_SECRET, BASE_URL, SPACES_PUBLIC_URL } = process.env;


const ESIGN_ORIGINALS_PATH = ESIGN_PATHS.ESIGN_ORIGINALS_PATH;
const ESIGN_PDF_PATH = ESIGN_PATHS.ESIGN_PDF_PATH;
const ESIGN_SIGNED_PATH = ESIGN_PATHS.ESIGN_SIGNED_PATH;

// eSignController.generate_template = async (req, res) => {
//     console.log("🚀 ~ POST /api/generate-template (multi-html, multi-user, single PDF)");

//     try {
//         const { htmlTemplates, userData } = req.body;

//         // --------------------- VALIDATE htmlTemplates ----------------------
//         let templates = [];
//         try {
//             templates = Array.isArray(htmlTemplates)
//                 ? htmlTemplates
//                 : JSON.parse(htmlTemplates);
//         } catch {
//             return res
//                 .status(400)
//                 .json({ error: "htmlTemplates must be a valid array" });
//         }

//         if (!templates.length) {
//             return res
//                 .status(400)
//                 .json({ error: "At least one HTML template required" });
//         }

//         // --------------------- VALIDATE userData --------------------------
//         let users = [];
//         try {
//             users = Array.isArray(userData) ? userData : JSON.parse(userData);
//         } catch {
//             return res
//                 .status(400)
//                 .json({ error: "userData must be a valid array" });
//         }

//         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//         users = users
//             .map((u) => ({
//                 name: u.name?.trim(),
//                 email: u.email?.trim()?.toLowerCase(),
//             }))
//             .filter((u) => u.email && emailRegex.test(u.email));

//         if (!users.length) {
//             return res.status(400).json({ error: "Invalid userData format" });
//         }

//         // --------------------- SAVE HTML + GENERATE INDIVIDUAL PDF BUFFERS ---------------
//         const files = [];        // HTML metadata for DB
//         const pdfBuffers = [];   // PDF buffers to merge later

//         // IMPORTANT: we do NOT change your HTML/CSS.
//         // We use templates EXACTLY as received.
//         let browser;
//         if (process.env.NODE_ENV === "development") {
//             browser = await puppeteer.launch({ args: ["--no-sandbox"] });
//         } else {
//             browser = await puppeteer_core.launch({
//                 args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
//                 defaultViewport: chromium.defaultViewport,
//                 executablePath: await chromium.executablePath(),
//                 headless: chromium.headless,
//             });
//         }


//         try {
//             for (let i = 0; i < templates.length; i++) {
//                 const templateItem = templates[i];

//                 // htmlTemplates can be either pure strings or { html: "<...>" }
//                 const rawHtml =
//                     typeof templateItem === "string"
//                         ? templateItem
//                         : (templateItem?.html || "");

//                 if (!rawHtml) {
//                     console.warn(`Template index ${i} has no valid HTML, skipping.`);
//                     continue;
//                 }

//                 const baseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-template`;
//                 const htmlFileName = `${baseName}.html`;

//                 // -------------------------
//                 // 1) UPLOAD HTML TO SPACES
//                 // -------------------------
//                 const htmlKey = htmlFileName; // esign/originals/xxx.html

//                 await AwsFileUpload.uploadToSpaces({
//                     fileData: Buffer.from(rawHtml, "utf-8"),
//                     filename: htmlFileName,
//                     filepath: ESIGN_ORIGINALS_PATH,
//                     mimetype: "text/html",
//                 });

//                 // -------------------------
//                 // 2) RENDER THIS HTML TO PDF PAGE (BUFFER)
//                 // -------------------------
//                 const page = await browser.newPage();

//                 await page.setViewport({ width: 1024, height: 768 });

//                 await page.setContent(rawHtml, {
//                     waitUntil: "networkidle0",
//                 });

//                 const pdfBuffer = await page.pdf({
//                     format: "A4",
//                     printBackground: true,
//                     margin: {
//                         top: "0px",
//                         right: "0px",
//                         bottom: "0px",
//                         left: "0px",
//                     },
//                 });

//                 await page.close();

//                 pdfBuffers.push(pdfBuffer);

//                 // -------------------------
//                 // 3) STORE HTML METADATA FOR ENVELOPE
//                 // -------------------------
//                 files.push({
//                     filename: htmlFileName,
//                     storedName: htmlFileName,
//                     publicUrl: htmlKey, // KEY inside Spaces (no base URL here)
//                     mimetype: "text/html",
//                     html: rawHtml,      // unchanged HTML
//                 });
//             }
//         } finally {
//             await browser.close();
//         }

//         if (!files.length || !pdfBuffers.length) {
//             return res
//                 .status(400)
//                 .json({ error: "No valid HTML templates after processing" });
//         }

//         // --------------------- MERGE ALL PDF BUFFERS INTO SINGLE PDF -----------------
//         const mergedPdf = await PDFDocument.create();

//         for (const buf of pdfBuffers) {
//             const pdf = await PDFDocument.load(buf);
//             const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
//             copiedPages.forEach((p) => mergedPdf.addPage(p));
//         }

//         const mergedPdfBytes = await mergedPdf.save();

//         // --------------------- UPLOAD MERGED PDF TO SPACES -----------------
//         const mergedBaseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-merged`;
//         const mergedPdfFileName = `${mergedBaseName}.pdf`;
//         const mergedKey = DIRECTORIES.PDF_DIRECTORY + mergedPdfFileName; // esign/pdf/xxx.pdf`

//         await AwsFileUpload.uploadToSpaces({
//             fileData: mergedPdfBytes,
//             filename: mergedPdfFileName,
//             filepath: ESIGN_PDF_PATH,
//             mimetype: "application/pdf",
//         });

//         // In DB we store only the KEY (relative path)
//         const mergedPdfKey = mergedKey;

//         // --------------------- CREATE SIGNERS -----------------------------
//         const now = new Date();
//         const signers = users.map((u) => ({
//             email: u.email,
//             name: u.name,
//             status: SIGN_EVENTS.SENT,
//             sentAt: now,
//             signedUrl: "",
//             tokenUrl: "",
//         }));

//         // --------------------- CREATE ENVELOPE ----------------------------
//         let env = await Envelope.create({
//             signers,
//             files,                        // HTML meta array
//             documentStatus: SIGN_EVENTS.SENT,
//             pdf: mergedPdfKey,            // 👈 store Spaces KEY in DB
//             signedPdf: "",
//             signedUrl: "",
//             tokenUrl: "",
//         });

//         // --------------------- GENERATE SIGN URL PER SIGNER --------------
//         const signerResults = [];
//         for (let i = 0; i < env.signers.length; i++) {
//             const s = env.signers[i];
//             const token = jwt.sign(
//                 { envId: String(env._id), email: s.email, i },
//                 JWT_SECRET
//             );

//             const signUrl = `${process.env.SIGNING_WEB_URL}?token=${token}`;

//             env.signers[i].tokenUrl = signUrl;

//             signerResults.push({
//                 email: s.email,
//                 name: s.name,
//                 tokenUrl: signUrl,
//             });
//         }

//         // Shortcut to first signer URL
//         env.tokenUrl = signerResults[0]?.tokenUrl || "";
//         await env.save();

//         // --------------------- SEND EMAILS -------------------------------
//         await Promise.all(
//             signerResults.map(async ({ email, name, tokenUrl }) => {
//                 const subject = "Your document is ready for signature";
//                 const bodyHtml = `
//           <html>
//           <body>
//               <p>Hello ${name},</p>
//               <p>Your documents are ready to sign:</p>
//               <p><a href="${tokenUrl}" target="_blank">Sign Now</a></p>
//           </body>
//           </html>
//         `;
//                 await sendMail(email, subject, bodyHtml);
//             })
//         );

//         // --------------------- BUILD RESPONSE DATA ------------------------
//         const resFiles = files.map((f) => ({
//             filename: f.filename,
//             // full public URL using Spaces
//             publicUrl: `${SPACES_PUBLIC_URL}${f.publicUrl}`,
//             mimetype: f.mimetype,
//             html: f.html,
//         }));

//         const resMergedPdf = {
//             filename: mergedPdfFileName,
//             publicUrl: `${SPACES_PUBLIC_URL}${mergedPdfKey}`,
//             mimetype: "application/pdf",
//         };

//         // --------------------- RESPONSE ----------------------------------
//         return res.json({
//             status: true,
//             message: "emails sent successfully",
//             envelopeId: String(env._id),
//             // envelopeSignUrl: env.signedUrl,
//             // signers: env.signers,
//             // pdf: `${SPACES_PUBLIC_URL}${mergedPdfKey}`, // full URL
//             // mergedPdf: resMergedPdf,
//             // resFiles,
//             // templatesHtml: files.map((f, index) => ({
//             //     index,
//             //     filename: f.filename,
//             //     html: f.html,
//             // })),
//         });
//     } catch (e) {
//         console.error(e);
//         return res.status(500).json({ error: "Generation failed" });
//     }
// };

eSignController.generate_template = async (req, res) => {
    console.log("🚀 ~ POST /api/generate-template (multi-html, multi-user, single PDF)");

    try {
        const { htmlTemplates, userData } = req.body;

        // --------------------- VALIDATE htmlTemplates ----------------------
        let templates = [];
        try {
            templates = Array.isArray(htmlTemplates)
                ? htmlTemplates
                : JSON.parse(htmlTemplates);
        } catch {
            return res.status(400).json({ error: "htmlTemplates must be a valid array" });
        }

        if (!templates.length) {
            return res.status(400).json({ error: "At least one HTML template required" });
        }

        // --------------------- VALIDATE userData --------------------------
        let users = [];
        try {
            users = Array.isArray(userData) ? userData : JSON.parse(userData);
        } catch {
            return res.status(400).json({ error: "userData must be a valid array" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        users = users
            .map((u) => ({
                name: u.name?.trim(),
                email: u.email?.trim()?.toLowerCase(),
            }))
            .filter((u) => u.email && emailRegex.test(u.email));

        if (!users.length) {
            return res.status(400).json({ error: "Invalid userData format" });
        }

        // --------------------- GENERATE INDIVIDUAL PDF BUFFERS ---------------
        const files = [];
        const pdfBuffers = [];

        let browser;
        if (process.env.NODE_ENV === "development") {
            browser = await puppeteer.launch({ args: ["--no-sandbox"] });
        } else {
            browser = await puppeteer_core.launch({
                args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
            });
        }

        try {
            for (let i = 0; i < templates.length; i++) {
                const templateItem = templates[i];

                // If old format: templateItem is a string
                // If new format: templateItem.html exists
                const rawHtml = typeof templateItem === "string"
                    ? templateItem
                    : (templateItem?.html || "");

                if (!rawHtml) {
                    console.warn(`Template index ${i} has no valid HTML, skipping.`);
                    continue;
                }

                // FILE NAME LOGIC: If user passed "name" use it, else fallback
                const givenName = typeof templateItem === "object" ? templateItem.name : null;

                const baseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-template`;
                const htmlFileName = `${baseName}.html`;

                // -------------------------
                // 1) UPLOAD HTML TO SPACES
                // -------------------------
                await AwsFileUpload.uploadToSpaces({
                    fileData: Buffer.from(rawHtml, "utf-8"),
                    filename: htmlFileName,
                    filepath: ESIGN_ORIGINALS_PATH,
                    mimetype: "text/html",
                });

                // -------------------------
                // 2) RENDER THIS HTML TO PDF BUFFER
                // -------------------------
                const page = await browser.newPage();
                await page.setViewport({ width: 1024, height: 768 });

                await page.setContent(rawHtml, { waitUntil: "networkidle0" });

                const pdfBuffer = await page.pdf({
                    format: "A4",
                    printBackground: true,
                    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
                });

                await page.close();

                pdfBuffers.push(pdfBuffer);

                // -------------------------
                // 3) STORE META FOR DB
                // -------------------------
                files.push({
                    filename: givenName,
                    storedName: htmlFileName,
                    publicUrl: htmlFileName,
                    mimetype: "text/html",
                    html: rawHtml,
                });
            }
        } finally {
            await browser.close();
        }

        if (!files.length || !pdfBuffers.length) {
            return res.status(400).json({ error: "No valid HTML templates after processing" });
        }

        // --------------------- MERGE ALL PDF BUFFERS -------------------------
        const mergedPdf = await PDFDocument.create();

        for (const buf of pdfBuffers) {
            const pdf = await PDFDocument.load(buf);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((p) => mergedPdf.addPage(p));
        }

        const mergedPdfBytes = await mergedPdf.save();

        const mergedBaseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-merged`;
        const mergedPdfFileName = `${mergedBaseName}.pdf`;
        const mergedKey = DIRECTORIES.PDF_DIRECTORY + mergedPdfFileName;

        // Upload merged PDF
        await AwsFileUpload.uploadToSpaces({
            fileData: mergedPdfBytes,
            filename: mergedPdfFileName,
            filepath: ESIGN_PDF_PATH,
            mimetype: "application/pdf",
        });

        // --------------------- CREATE SIGNERS -----------------------------
        const now = new Date();
        const signers = users.map((u) => ({
            email: u.email,
            name: u.name,
            status: SIGN_EVENTS.SENT,
            sentAt: now,
            signedUrl: "",
            tokenUrl: "",
        }));

        // --------------------- CREATE ENVELOPE ----------------------------
        let env = await Envelope.create({
            signers,
            files,
            documentStatus: SIGN_EVENTS.SENT,
            pdf: mergedKey,
            signedPdf: "",
            signedUrl: "",
            tokenUrl: "",
        });

        // --------------------- GENERATE SIGNING URL ------------------------
        const signerResults = [];
        for (let i = 0; i < env.signers.length; i++) {
            const s = env.signers[i];
            const token = jwt.sign(
                { envId: String(env._id), email: s.email, i },
                JWT_SECRET
            );

            const signUrl = `${process.env.SIGNING_WEB_URL}?token=${token}`;
            env.signers[i].tokenUrl = signUrl;

            signerResults.push({
                email: s.email,
                name: s.name,
                tokenUrl: signUrl,
            });
        }

        env.tokenUrl = signerResults[0]?.tokenUrl || "";
        await env.save();

        // --------------------- SEND EMAILS -------------------------------
        await Promise.all(
            signerResults.map(async ({ email, name, tokenUrl }) => {
                console.log("🚀 ~ email:", email)
                const subject = "Your document is ready for signature";
                const bodyHtml = `
                <html><body>
                    <p>Hello ${name},</p>
                    <p>Your documents are ready to sign:</p>
                    <p><a href="${tokenUrl}" target="_blank">Sign Now</a></p>
                </body></html>`;
                await sendMail(email, subject, bodyHtml);
            })
        );

        // --------------------- SUCCESS RESPONSE --------------------------
        return res.json({
            status: true,
            message: "emails sent successfully",
            envelopeId: String(env._id),
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Generation failed" });
    }
};
eSignController.readEnvelopeByToken = async (req, res) => {
    console.log("/api/envelopes/by-token", req.query);

    try {
        const env = await Envelope.findById(req.envId);
        if (!env) {
            return res.status(404).json({ error: "Envelope not found" });
        }

        // find signer by index or email
        let idx =
            typeof req.signerIndex === "number"
                ? req.signerIndex
                : env.signers.findIndex((s) => s.email === req.signerEmail);

        if (idx < 0 || idx >= env.signers.length) {
            return res.status(400).json({ error: "Signer not found in envelope" });
        }

        // mark DELIVERED if not already
        if (env.signers[idx].status == SIGN_EVENTS.SENT) {
            env.signers[idx].status = SIGN_EVENTS.DELIVERED;
            env.signers[idx].deliveredAt = new Date();
            // optional: if all signers delivered, bump envelope to DELIVERED
            if (
                env.signers.every((s) =>
                    [SIGN_EVENTS.DELIVERED, SIGN_EVENTS.COMPLETED].includes(s.status)
                )
            ) {
                env.documentStatus = SIGN_EVENTS.DELIVERED;
            }

            await env.save();
        }

        const htmlTemplates = (env.files || [])
            .filter((f) => f.mimetype === "text/html")
            .map((f) => ({
                filename: f.filename,
                url: `${SPACES_PUBLIC_URL}${f.publicUrl}`, // Spaces URL
                mimetype: f.mimetype,
                html: f.html || null,
            }));

        return res.json({
            status: true,
            message: "Envelope loaded successfully",
            envelopeId: String(env._id),
            documentStatus: env.documentStatus,
            signer: {
                index: idx,
                email: env.signers[idx].email,
                name: env.signers[idx].name,
                status: env.signers[idx].status,
                sentAt: env.signers[idx].sentAt,
                deliveredAt: env.signers[idx].deliveredAt,
                completedAt: env.signers[idx].completedAt,
            },
            files: env.files.map((f) => ({
                filename: f.filename,
                url: `${SPACES_PUBLIC_URL}${f.publicUrl}`, // Spaces URL
                mimetype: f.mimetype,
            })),
            htmlTemplates,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load envelope" });
    }
};

eSignController.completeEnvelope = async (req, res) => {
    let browser;
    try {
        console.log("POST /api/envelopes/complete", req.query);


        const { template, location } = req.body;
        const envelopeId = req.envId;
        const signerEmail = req.signerEmail;

        if (!envelopeId || !signerEmail) {
            return res.status(400).json({
                error: "Missing envelopeId or signerEmail in request",
            });
        }


        if (!Array.isArray(template) || template.length === 0) {
            return res.status(400).json({
                error: "template must be a non-empty array of HTML strings",
            });
        }


        let env = await Envelope.findOne({ _id: envelopeId, "signers.email": signerEmail });

        if (!env) {
            return res.status(404).json({ error: "Envelope not found" });
        }


        const idx = env.signers.findIndex((s) => s.email === signerEmail);
        if (idx < 0) {
            return res.status(400).json({ error: "Signer not found in envelope" });
        }


        if (env.signers[idx].status === SIGN_EVENTS.COMPLETED) {
            return res.status(400).json({
                error: "This signer has already completed the document",
            });
        }


        const existingFiles = Array.isArray(env.files) ? env.files : [];

        env.files = template.map((htmlStr, index) => {
            const prev = existingFiles[index] || {};
            return {
                filename: prev.filename || `page-${index + 1}.html`,
                storedName: prev.storedName || prev.filename || "",
                publicUrl: prev.publicUrl || "",
                mimetype: prev.mimetype || "text/html",
                html: htmlStr,
            };
        });


        const htmlParts = env.files
            .map((f) => f.html || "")
            .filter((h) => h.trim().length > 0);

        if (htmlParts.length === 0) {
            return res.status(400).json({
                error: "No HTML content found in envelope files",
            });
        }

        const fullHtml = buildFullPdfHtml(htmlParts);


        if (process.env.NODE_ENV === "development") {
            browser = await puppeteer.launch({ args: ["--no-sandbox"] });
        } else {
            browser = await puppeteer_core.launch({
                args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
            });
        }

        const page = await browser.newPage();

        await page.setContent(fullHtml, {
            waitUntil: "networkidle0",
        });

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "15mm",
                right: "15mm",
                bottom: "15mm",
                left: "15mm",
            },
        });

        const outputName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}.pdf`;
        const signedKey = ESIGN_SIGNED_PATH + outputName;

        await AwsFileUpload.uploadToSpaces({
            fileData: pdfBuffer,
            filename: outputName,
            filepath: ESIGN_SIGNED_PATH,
            mimetype: "application/pdf",
        });

        const signedUrlKey = signedKey;

        env.signers[idx].status = SIGN_EVENTS.COMPLETED;
        env.signers[idx].completedAt = new Date();
        env.signers[idx].signedUrl = signedUrlKey;
        env.signers[idx].location = location || {};
        env.signers[idx].ipAddress = normalizeIP(req) || "";

        env.signedPdf = signedUrlKey;

        if (env.signers.every((s) => s.status === SIGN_EVENTS.COMPLETED)) {
            env.documentStatus = SIGN_EVENTS.COMPLETED;
        }

        await env.save();

        return res.json({
            status: true,
            message: "Envelope completed successfully",
            downloadUrl: `${SPACES_PUBLIC_URL}${env.signedPdf}`,
            envelopeId: String(env._id),
            signerIndex: idx,
            signerEmail: env.signers[idx].email,
            documentStatus: env.documentStatus,
        });
    } catch (err) {
        console.error(
            "Error in /api/envelopes/complete",
            err && err.stack ? err.stack : err
        );
        return res
            .status(500)
            .json({ error: err?.message || "Envelope completion failed" });
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error("Error closing Puppeteer browser", e);
            }
        }
    }
};

eSignController.cancelEnvelope = async (req, res) => {
    console.log("/api/envelopes/:token/cancel");
    let env = await Envelope.findById(req.envId);
    if (!env) return res.status(404).json({ error: "Envelope not found" });

    env.documentStatus = SIGN_EVENTS.VOIDED;
    env.signers = env.signers.map((s) => ({
        ...s.toObject(),
        status: SIGN_EVENTS.VOIDED,
    }));
    await env.save();

    res.json({
        status: true,
        message: "Cancelled successfully",
        envelopeId: String(env._id),
    });
};

eSignController.envelopeDetails = async (req, res) => {
    console.log("/api/envelopes/envelopeDetails");

    const { envId } = req.body;

    let env = await Envelope.findById(envId);
    if (!env) return res.status(404).json({ error: "Envelope not found" });

    let result = {
        _id: env._id,
        documentStatus: env.documentStatus,
        signers: env.signers,
        pdf: `${SPACES_PUBLIC_URL}/storage/pdf/${env.pdf}`,
        signedPdf: `${SPACES_PUBLIC_URL}/storage/signed/${env.signedPdf}`,
        createdAt: env.createdAt,
        updatedAt: env.updatedAt
    }

    res.json({
        status: true,
        message: "Envelope details fetched successfully",
        envelopeId: result,
    });
};

eSignController.uploadImg = async (req, res) => {

    const files = req.files;
    let s3Directory = ESIGN_PDF_PATH;

    let imgPath = `${Date.now()}.${files.file.name.substr(files.file.name.lastIndexOf('.') + 1)}`;

    await AwsFileUpload.uploadToSpaces({
        fileData: files.file.data,
        filename: imgPath,
        filepath: s3Directory,
        mimetype: files.file.mimetype
    });

    return res.json({
        status: true,
        message: "Cancelled successfully",
        url: process.env.SPACES_PUBLIC_URL + DIRECTORIES.PDF_DIRECTORY + imgPath
    });
};

module.exports = eSignController;
