const eSignController = {};
const sendMail = require("../middleware/sendmail");
const { SIGN_EVENTS } = require("../contance.js");
const Envelope = require("../model/eSignModel");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, BASE_URL } = process.env;

const fsp = require("fs/promises");
const ORIGINALS_DIR = path.join(__dirname, "../storage/originals");
const PDF_DIRECTORY = path.join(__dirname, "../storage/pdf");
// const SIGNED_DIR = path.join("storage", "/signed");
const { generatePdfDocumentFromTemplate, buildFullPdfHtml } = require("../middleware/helper");
const { default: puppeteer } = require("puppeteer");
const { PDFDocument } = require('pdf-lib');

console.log(PDF_DIRECTORY)

function generateId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// eSignController.generate_template = async (req, res) => {
//     console.log("🚀 ~ POST /api/generate-template (multi-html, multi-user)");

//     try {
//         // ❌ templateData removed from here
//         const { htmlTemplates, userData } = req.body;

//         // --------------------- VALIDATE htmlTemplates ----------------------
//         let templates = [];
//         try {
//             templates = Array.isArray(htmlTemplates)
//                 ? htmlTemplates
//                 : JSON.parse(htmlTemplates);
//         } catch {
//             return res.status(400).json({ error: "htmlTemplates must be a valid array" });
//         }

//         if (!templates.length) {
//             return res.status(400).json({ error: "At least one HTML template required" });
//         }

//         // --------------------- VALIDATE userData --------------------------
//         let users = [];
//         try {
//             users = Array.isArray(userData) ? userData : JSON.parse(userData);
//         } catch {
//             return res.status(400).json({ error: "userData must be a valid array" });
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

//         // --------------------- SAVE ALL HTML FILES ------------------------
//         const files = [];

//         for (let i = 0; i < templates.length; i++) {
//             const rawHtml = templates[i];
//             const fileName = `${Date.now()}-${generateId()}-template-${i + 1}.html`;
//             const filePath = path.join(ORIGINALS_DIR, fileName);

//             // Save original HTML to disk (for static serving / debugging)
//             await fsp.writeFile(filePath, rawHtml, 'utf-8');

//             // Since template data is already injected in htmlTemplates,
//             // we can just pass an empty object here
//             const { file: htmlBuffer } = await generatePdfDocumentFromTemplate({
//                 templatePath: filePath,
//                 outputName: fileName,
//                 data: {}, // 👈 no templateData from user
//             });


//             const finalHtml = htmlBuffer.toString('utf-8');

//             // Persist file + final HTML in DB
//             files.push({
//                 filename: fileName,
//                 storedName: fileName,
//                 publicUrl: fileName,
//                 // publicUrl: `${BASE_URL}/storage/originals/${fileName}`,
//                 mimetype: "text/html",
//                 html: finalHtml, // processed HTML (currently same as rawHtml)
//             });
//         }

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
//             files,
//             documentStatus: SIGN_EVENTS.SENT,
//             pdf: "",
//             signedPdf: "",
//             signedUrl: "",
//             tokenUrl: "",
//         });

//         // --------------------- GENERATE SIGN URL PER SIGNER ----------------
//         const signerResults = [];
//         for (let i = 0; i < env.signers.length; i++) {
//             const s = env.signers[i];
//             const token = jwt.sign(
//                 { envId: String(env._id), email: s.email, i },
//                 JWT_SECRET
//             );

//             // const signUrl = `${BASE_URL}/api/envelopes/by-token/${token}`;
//             const signUrl = `https://tsp-secure-sign.vercel.app/documents?token=${token}`;
//             env.signers[i].tokenUrl = signUrl;

//             signerResults.push({
//                 email: s.email,
//                 name: s.name,
//                 tokenUrl: signUrl,
//             });
//         }

//         // Save env
//         env.tokenUrl = signerResults[0]?.tokenUrl;
//         await env.save();

//         // --------------------- SEND EMAILS --------------------------------
//         await Promise.all(
//             signerResults.map(async ({ email, name, tokenUrl }) => {
//                 console.log("🚀 ~ signedUrl:", tokenUrl)
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

//         let resFiles = files.map(f => ({
//             filename: f.filename,
//             publicUrl: `${BASE_URL}/storage/originals/${f.publicUrl}`,
//             mimetype: f.mimetype,
//             html: f.html,
//         }));

//         // --------------------- RESPONSE -----------------------------------
//         return res.json({
//             status: true,
//             message: "Templates processed and emails sent",
//             envelopeId: String(env._id),
//             envelopeSignUrl: env.signedUrl,
//             signers: env.signers,
//             resFiles,
//             templatesHtml: files.map((f, index) => ({
//                 index,
//                 filename: f.filename,
//                 html: f.html,
//             })),
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
            return res
                .status(400)
                .json({ error: "htmlTemplates must be a valid array" });
        }

        if (!templates.length) {
            return res
                .status(400)
                .json({ error: "At least one HTML template required" });
        }

        // --------------------- VALIDATE userData --------------------------
        let users = [];
        try {
            users = Array.isArray(userData) ? userData : JSON.parse(userData);
        } catch {
            return res
                .status(400)
                .json({ error: "userData must be a valid array" });
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

        // --------------------- PREPARE DIRECTORIES ------------------------
        // HTML originals dir (already in your code)
        // Create a /pdf folder next to it if not exists
        const PDF_DIR = path.join(path.join(PDF_DIRECTORY));
        await fsp.mkdir(PDF_DIR, { recursive: true });

        // --------------------- SAVE HTML + GENERATE INDIVIDUAL PDF BUFFERS ---------------
        const files = [];        // HTML metadata for DB
        const pdfBuffers = [];   // PDF buffers to merge later

        // IMPORTANT: we do NOT change your HTML/CSS.
        // We use templates EXACTLY as received.
        const browser = await puppeteer.launch({ args: ["--no-sandbox"] });

        try {
            for (let i = 0; i < templates.length; i++) {
                const templateItem = templates[i];

                // Your current payload is an array of pure HTML strings
                // But let's also support an object { html: "<...>" } in future:
                const rawHtml =
                    typeof templateItem === "string"
                        ? templateItem
                        : (templateItem?.html || "");

                if (!rawHtml) {
                    console.warn(`Template index ${i} has no valid HTML, skipping.`);
                    continue;
                }

                const baseName = `${Date.now()}-${generateId()}-template-${i + 1}`;
                const htmlFileName = `${baseName}.html`;
                const htmlFilePath = path.join(ORIGINALS_DIR, htmlFileName);

                // Save EXACT HTML to disk (no modifications, no placeholder replacement)
                await fsp.writeFile(htmlFilePath, rawHtml, "utf-8");

                // Render this HTML with Puppeteer and create a PDF buffer
                const page = await browser.newPage();

                // Set a viewport if you want to more closely match browser
                await page.setViewport({ width: 1024, height: 768 });

                await page.setContent(rawHtml, {
                    waitUntil: "networkidle0",
                });

                const pdfBuffer = await page.pdf({
                    format: "A4",
                    printBackground: true,
                    margin: {
                        top: "0px",
                        right: "0px",
                        bottom: "0px",
                        left: "0px",
                    },
                });

                await page.close();

                pdfBuffers.push(pdfBuffer);

                // Store HTML metadata (for Envelope.files)
                files.push({
                    filename: htmlFileName,
                    storedName: htmlFileName,
                    publicUrl: htmlFileName,
                    mimetype: "text/html",
                    html: rawHtml, // unchanged HTML
                });
            }
        } finally {
            await browser.close();
        }

        if (!files.length || !pdfBuffers.length) {
            return res
                .status(400)
                .json({ error: "No valid HTML templates after processing" });
        }

        // --------------------- MERGE ALL PDF BUFFERS INTO SINGLE PDF -----------------
        const mergedPdf = await PDFDocument.create();

        for (const buf of pdfBuffers) {
            const pdf = await PDFDocument.load(buf);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((p) => mergedPdf.addPage(p));
        }

        const mergedPdfBytes = await mergedPdf.save();

        // Save merged PDF to /pdf folder
        const mergedBaseName = `${Date.now()}-${generateId()}-merged`;
        const mergedPdfFileName = `${mergedBaseName}.pdf`;
        const mergedPdfFilePath = path.join(PDF_DIR, mergedPdfFileName);

        await fsp.writeFile(mergedPdfFilePath, mergedPdfBytes);

        // URL to be stored in Envelope.pdf (String)
        const mergedPdfUrl = `${BASE_URL}/storage/pdf/${mergedPdfFileName}`;

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
            files,                        // HTML meta array
            documentStatus: SIGN_EVENTS.SENT,
            pdf: mergedPdfUrl,            // 👈 single merged PDF URL as STRING
            signedPdf: "",
            signedUrl: "",
            tokenUrl: "",
        });

        // --------------------- GENERATE SIGN URL PER SIGNER --------------
        const signerResults = [];
        for (let i = 0; i < env.signers.length; i++) {
            const s = env.signers[i];
            const token = jwt.sign(
                { envId: String(env._id), email: s.email, i },
                JWT_SECRET
            );

            // const signUrl = `${BASE_URL}/api/envelopes/by-token/${token}`;
            const signUrl = `${process.env.SIGNING_WEB_URL}?token=${token}`;

            env.signers[i].tokenUrl = signUrl;

            signerResults.push({
                email: s.email,
                name: s.name,
                tokenUrl: signUrl,
            });
        }

        // Shortcut to first signer URL
        env.tokenUrl = signerResults[0]?.tokenUrl || "";
        await env.save();

        // --------------------- SEND EMAILS -------------------------------
        await Promise.all(
            signerResults.map(async ({ email, name, tokenUrl }) => {
                console.log("🚀 ~ signedUrl:", tokenUrl);
                const subject = "Your document is ready for signature";
                const bodyHtml = `
          <html>
          <body>
              <p>Hello ${name},</p>
              <p>Your documents are ready to sign:</p>
              <p><a href="${tokenUrl}" target="_blank">Sign Now</a></p>
          </body>
          </html>
        `;
                await sendMail(email, subject, bodyHtml);
            })
        );

        // --------------------- BUILD RESPONSE DATA ------------------------
        const resFiles = files.map((f) => ({
            filename: f.filename,
            publicUrl: `${BASE_URL}/storage/originals/${f.publicUrl}`,
            mimetype: f.mimetype,
            html: f.html,
        }));

        const resMergedPdf = {
            filename: mergedPdfFileName,
            publicUrl: mergedPdfUrl,
            mimetype: "application/pdf",
        };

        // --------------------- RESPONSE ----------------------------------
        return res.json({
            status: true,
            message: "Templates processed, single merged PDF generated, and emails sent",
            envelopeId: String(env._id),
            envelopeSignUrl: env.signedUrl,
            signers: env.signers,
            pdf: mergedPdfUrl,        // stored in DB as string
            mergedPdf: resMergedPdf,  // convenient object
            resFiles,                 // HTML info
            templatesHtml: files.map((f, index) => ({
                index,
                filename: f.filename,
                html: f.html,
            })),
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
            typeof req.signerIndex === "number" ? req.signerIndex : env.signers.findIndex((s) => s.email === req.signerEmail);

        if (idx < 0 || idx >= env.signers.length) {
            return res.status(400).json({ error: "Signer not found in envelope" });
        }

        // mark DELIVERED if not already
        if (env.signers[idx].status === SIGN_EVENTS.SENT) {
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
                url: `${BASE_URL}/storage/originals/${f.publicUrl}`,
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
                url: `${BASE_URL}/storage/originals/${f.publicUrl}`,
                mimetype: f.mimetype,
            })),
            htmlTemplates,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load envelope" });
    }
}

eSignController.completeEnvelope = async (req, res) => {
    let browser;
    try {
        console.log("POST /api/envelopes/complete", req.query);

        // 1. Get envelopeId & signer email from middleware (token decode)
        const { template } = req.body; // array of HTML strings
        const envelopeId = req.envId;
        const signerEmail = req.signerEmail;

        if (!envelopeId || !signerEmail) {
            return res.status(400).json({ error: "Missing envelopeId or signerEmail in request", });
        }

        // Validate template array
        if (!Array.isArray(template) || template.length === 0) {
            return res.status(400).json({ error: "template must be a non-empty array of HTML strings", });
        }

        // 2. Find envelope by _id and signer email
        const env = await Envelope.findOne({
            _id: envelopeId,
            "signers.email": signerEmail,
        });

        if (!env) { return res.status(404).json({ error: "Envelope not found" }); }

        // 3. Find signer index in signers array
        const idx = env.signers.findIndex((s) => s.email === signerEmail);
        if (idx < 0) {
            return res.status(400).json({ error: "Signer not found in envelope" });
        }

        // Optional: prevent double completion
        if (env.signers[idx].status === SIGN_EVENTS.COMPLETED) {
            return res.status(400).json({ error: "This signer has already completed the document", });
        }

        // 4. Update env.files[].html from req.body.template
        const existingFiles = Array.isArray(env.files) ? env.files : [];

        env.files = template.map((htmlStr, index) => {
            const prev = existingFiles[index] || {};
            return {
                filename: prev.filename || `page-${index + 1}.html`,
                storedName: prev.storedName || prev.filename || "",
                publicUrl: prev.publicUrl || "",
                mimetype: prev.mimetype || "text/html",
                html: htmlStr, // set/override HTML from request
            };
        });

        // 5. Build full HTML for PDF from updated env.files
        const htmlParts = env.files
            .map((f) => f.html || "")
            .filter((h) => h.trim().length > 0);

        if (htmlParts.length === 0) {
            return res.status(400).json({ error: "No HTML content found in envelope files" });
        }

        // ✅ paging logic controlled here:
        // - 1 template → continuous pages ✨
        // - >1 templates → each on a new page ✨
        const fullHtml = buildFullPdfHtml(htmlParts);

        // 6. Generate PDF from HTML using Puppeteer
        browser = await puppeteer.launch({ args: ["--no-sandbox"] });
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
            // landscape: true, // enable if you need landscape
        });

        // 7. Save PDF buffer to disk (e.g. /storage/signed)
        const signedDir = path.join(__dirname, "..", "storage", "signed");
        await fs.promises.mkdir(signedDir, { recursive: true });

        const outputName = `envelope-${env._id}-${Date.now()}.pdf`;
        const outputPath = path.join(signedDir, outputName);

        await fs.promises.writeFile(outputPath, pdfBuffer);

        const signedUrl = outputName; // store only file name in DB

        // 8. Update this signer status & signedUrl
        env.signers[idx].status = SIGN_EVENTS.COMPLETED;
        env.signers[idx].completedAt = new Date();
        env.signers[idx].signedUrl = signedUrl;

        // 9. Update envelope-level signedPdf (file name)
        env.signedPdf = signedUrl;

        // 10. If ALL signers completed => envelope COMPLETED
        if (env.signers.every((s) => s.status === SIGN_EVENTS.COMPLETED)) {
            env.documentStatus = SIGN_EVENTS.COMPLETED;
        }

        await env.save();

        // 11. Send response with full download URL
        return res.json({
            status: true,
            message: "Envelope completed successfully",
            downloadUrl: `${BASE_URL}/storage/signed/${env.signedPdf}`,
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

    res.json({ status: true, message: "Cancelled successfully", envelopeId: String(env._id) });
}

// --- Serve signing page ---
// eSignController.serveSigningPage = async (req, res) => {
//     console.log("/sign/:token");
//     try {
//         console.log("🚀 ~ req.params.token:", req.query.token)
//         const decoded = jwt.verify(req.query.token, JWT_SECRET);

//         try {
//             const env = await Envelope.findById(
//                 decoded.envId || decoded._id
//             );
//             if (
//                 env &&
//                 env.documentStatus === SIGN_EVENTS.COMPLETED &&
//                 env.signedPdf
//             ) {
//                 return res.redirect(env.signedPdf);
//             }
//         } catch (e) {
//             console.error("Error checking envelope status:", e);
//         }


//         // res.sendFile(path.join(__dirname, "../", "sign.html"));
//     } catch (err) {
//         return res.status(401).send("Link expired");
//     }
// }


module.exports = eSignController