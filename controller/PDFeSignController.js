const PDFeSignController = {};
const fs = require("fs");
const path = require("path");
const sendMail = require("../services/sendmail.js");
const { SIGN_EVENTS, DIRECTORIES, ESIGN_PATHS, userId, STATICUSERID, IS_ACTIVE_ENUM } = require("../config/contance.js");
const Envelope = require("../model/eSignModel");
const jwt = require("jsonwebtoken");
const { addHeaderToPdf, getCurrentDayInNumber, base64ToPdfBuffer, toNum, normalizeIP, mergePdfBuffers, getCurrentMOnth, getCurrentYear, triggerWebhookEvent, setEnvelopeData, getFirstRoutingOrder, sendRoutingGroupEmails, sendSigningMailToSigner, pdfBufferToBase64 } = require("../middleware/helper");
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');  // ← ADD THIS

const AwsFileUpload = require("../services/s3Upload"); // <-- change path as per your project
const signatureModel = require("../model/signatureModel.js");

const { JWT_SECRET, BASE_URL, SPACES_PUBLIC_URL, SIGNING_WEB_URL } = process.env;


const ESIGN_ORIGINALS_PATH = ESIGN_PATHS.ESIGN_ORIGINALS_PATH;
const ESIGN_PDF_PATH = ESIGN_PATHS.ESIGN_PDF_PATH;
const ESIGN_SIGNED_PATH = ESIGN_PATHS.ESIGN_SIGNED_PATH;

// without routing order support
// PDFeSignController.storePdf = async (req, res) => {
//     try {
//         const { base64, userData,isRoutingOrder } = req.body;

//         // ------------------ Parse templates (array of objects) ------------------
//         let templates = [];
//         try {
//             templates = Array.isArray(base64) ? base64 : JSON.parse(base64);
//         } catch {
//             return res.status(400).json({ error: "base64 must be a valid array" });
//         }

//         if (!templates.length) {
//             return res
//                 .status(400)
//                 .json({ error: "At least one PDF template required in base64" });
//         }

//         // ✅ now includes fileId
//         templates = templates
//             .map((t, idx) => ({
//                 name: (t?.name || `Document-${idx + 1}`).toString(),
//                 documentBase64: (t?.documentBase64 || "").toString(),
//                 fileId: (t?.fileId || "").toString().trim(), // ✅ NEW
//             }))
//             .filter((t) => !!t.documentBase64);

//         if (!templates.length) {
//             return res
//                 .status(400)
//                 .json({ error: "base64 items must contain documentBase64" });
//         }

//         // ------------------ Parse user data ------------------
//         let users = [];
//         try {
//             users = Array.isArray(userData) ? userData : JSON.parse(userData);
//         } catch {
//             return res.status(400).json({ error: "userData must be a valid array" });
//         }

//         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

//         users = users
//             .map((u) => ({
//                 name: u?.name?.trim?.() || "",
//                 email: u?.email?.trim?.()?.toLowerCase?.(),
//                 tabs: Array.isArray(u?.tabs) ? u.tabs : [], // ✅ tabs preserved (contains fileId already)
//             }))
//             .filter((u) => u.email && emailRegex.test(u.email));

//         if (!users.length) {
//             return res.status(400).json({ error: "Invalid userData format" });
//         }

//         // ------------------ Convert base64 -> buffers + upload each PDF ------------------
//         const files = [];
//         const pdfBuffers = [];

//         for (let i = 0; i < templates.length; i++) {
//             const { documentBase64, name, fileId } = templates[i];

//             const cleanBase64 = String(documentBase64 || "")
//                 .replace(/^data:application\/pdf;base64,/i, "")
//                 .trim();

//             if (!cleanBase64) {
//                 console.warn(`PDF index ${i} is empty, skipping.`);
//                 continue;
//             }

//             let pdfBuffer;
//             try {
//                 pdfBuffer = Buffer.from(cleanBase64, "base64");
//             } catch (e) {
//                 console.warn(`PDF index ${i} invalid base64, skipping.`);
//                 continue;
//             }

//             const header = pdfBuffer.slice(0, 4).toString("utf8");
//             if (header !== "%PDF") {
//                 console.warn(`PDF index ${i} does not look like a valid PDF, skipping.`);
//                 continue;
//             }

//             pdfBuffers.push(pdfBuffer);

//             const baseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-pdf-${i + 1}`;
//             const pdfFileName = `${baseName}.pdf`;

//             const uploadResult = await AwsFileUpload.uploadToSpaces({
//                 fileData: pdfBuffer,
//                 filename: pdfFileName,
//                 filepath: ESIGN_PDF_PATH,
//                 mimetype: "application/pdf",
//             });

//             // const publicUrl =
//             //     uploadResult?.publicUrl ||
//             //     uploadResult?.Location ||
//             //     `${ESIGN_PDF_PATH}/${pdfFileName}`;

//             // ✅ store in DB with fileId
//             files.push({
//                 filename: name,
//                 storedName: pdfFileName,
//                 publicUrl: pdfFileName,
//                 mimetype: "application/pdf",
//                 html: documentBase64, // (keeping same as your current behavior)
//                 templatePdf: pdfFileName,
//                 signedTemplatePdf: null,
//                 fileId: fileId || "", // ✅ NEW
//             });
//         }

//         if (!files.length || !pdfBuffers.length) {
//             return res.status(400).json({ error: "No valid PDFs after processing" });
//         }

//         // ------------------ Merge PDFs ------------------
//         const mergedPdf = await PDFDocument.create();

//         for (const buf of pdfBuffers) {
//             const pdf = await PDFDocument.load(buf);
//             const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
//             copiedPages.forEach((p) => mergedPdf.addPage(p));
//         }

//         const mergedPdfBytes = await mergedPdf.save();
//         const mergedBaseName = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}_${Date.now()}-merged`;
//         const mergedPdfFileName = `${mergedBaseName}.pdf`;
//         const mergedKey = mergedPdfFileName;

//         // ------------------ Setup envelope & signers ------------------
//         const now = new Date();

//         const signers = users.map((u) => ({
//             email: u.email,
//             name: u.name,
//             status: SIGN_EVENTS.SENT,
//             sentAt: now,
//             tokenUrl: "",
//             metaData: u.tabs, // ✅ tabs stored as-is (contains fileId per tab)
//         }));

//         let env = await Envelope.create({
//             signers,
//             files,
//             documentStatus: SIGN_EVENTS.SENT,
//             pdf: mergedKey,
//             signedPdf: "",
//             signedUrl: "",
//             contentType: "application/pdf",
//         });

//         // ------------------ Add header with Envelope ID ------------------
//         const finalMergedBytes = await addHeaderToPdf(mergedPdfBytes, env._id);

//         // ------------------ Upload final merged PDF (with header) ------------------
//         const mergedUploadResult = await AwsFileUpload.uploadToSpaces({
//             fileData: finalMergedBytes,
//             filename: mergedPdfFileName,
//             filepath: ESIGN_PDF_PATH,
//             mimetype: "application/pdf",
//         });

//         const mergedPublicUrl =
//             mergedUploadResult?.publicUrl ||
//             mergedUploadResult?.Location ||
//             `${ESIGN_PDF_PATH}/${mergedPdfFileName}`;

//         // if your schema supports storing pdf url, otherwise remove this
//         env.pdf = mergedKey;
//         if ("pdfUrl" in env) env.pdfUrl = mergedPublicUrl;

//         // ------------------ Generate token URLs and save env ------------------
//         const signerResults = [];

//         for (let i = 0; i < env.signers.length; i++) {
//             const s = env.signers[i];
//             const token = jwt.sign(
//                 { envId: String(env._id), email: s.email, i },
//                 JWT_SECRET
//             );

//             const signUrl = `${SIGNING_WEB_URL}/pdf-documents?type=${token}`;

//             env.signers[i].tokenUrl = signUrl;

//             signerResults.push({
//                 email: s.email,
//                 name: s.name,
//                 tokenUrl: signUrl,
//                 metaData: env.signers[i].metaData,
//             });
//         }

//         env.signedUrl = signerResults[0]?.tokenUrl || "";
//         await env.save();

//         const setEnv = { envelopeId: env._id, event: SIGN_EVENTS.SENT };
//         await triggerWebhookEvent(SIGN_EVENTS.SENT, STATICUSERID, setEnv);

//         // ------------------ Load email template HTML ------------------
//         const templatePath = path.join(
//             __dirname,
//             "../public/template/sendDocument.html"
//         );
//         const emailTemplateRaw = fs.readFileSync(templatePath, "utf8");

//         // ------------------ Send Emails ------------------
//         await Promise.all(
//             signerResults.map(async ({ email, name, tokenUrl }) => {
//                 const firstFile = files[0];
//                 const docName = firstFile?.filename || "Document";

//                 const emailHtml = emailTemplateRaw
//                     .replace(/{{name}}/g, name || "")
//                     .replace(/{{signUrl}}/g, tokenUrl)
//                     .replace(/{{DocumentName}}/g, docName);

//                 const subject = "Please sign the documents";
//                 await sendMail(email, subject, emailHtml);
//             })
//         );

//         return res.json({
//             status: true,
//             message: "emails sent successfully",
//             envelopeId: String(env._id),
//         });
//     } catch (e) {
//         console.error("🔥 Error in storePdf:", e);
//         return res.status(500).json({ error: "Generation failed" });
//     }
// };
// PDFeSignController.storePdf = async (req, res) => {
//   try {
//     const { base64, userData, isRoutingOrder } = req.body;

//     // -------- parse templates
//     let templates = [];
//     try { templates = Array.isArray(base64) ? base64 : JSON.parse(base64); }
//     catch { return res.status(400).json({ error: "base64 must be a valid array" }); }

//     if (!templates.length) return res.status(400).json({ error: "At least one PDF template required in base64" });

//     templates = templates
//       .map((t, idx) => ({
//         name: (t?.name || `Document-${idx + 1}`).toString(),
//         documentBase64: (t?.documentBase64 || "").toString(),
//         fileId: (t?.fileId || "").toString().trim(),
//       }))
//       .filter((t) => !!t.documentBase64);

//     if (!templates.length) return res.status(400).json({ error: "base64 items must contain documentBase64" });

//     // -------- parse users
//     let users = [];
//     try { users = Array.isArray(userData) ? userData : JSON.parse(userData); }
//     catch { return res.status(400).json({ error: "userData must be a valid array" }); }

//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

//     users = users
//       .map((u) => ({
//         name: u?.name?.trim?.() || "",
//         email: u?.email?.trim?.()?.toLowerCase?.(),
//         tabs: Array.isArray(u?.tabs) ? u.tabs : [],
//         isAction: u?.isAction === IS_ACTIVE_ENUM.RECEIVE_COPY ? IS_ACTIVE_ENUM.RECEIVE_COPY : IS_ACTIVE_ENUM.NEED_TO_SIGN,
//         routingOrder: Number.isFinite(+u?.routingOrder) ? +u.routingOrder : 0,
//       }))
//       .filter((u) => u.email && emailRegex.test(u.email));

//     if (!users.length) return res.status(400).json({ error: "Invalid userData format" });

//     // -------- upload each pdf + collect buffers
//     const files = [];
//     const pdfBuffers = [];
//     const nowMs = Date.now();
//     const datePart = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}`;

//     for (let i = 0; i < templates.length; i++) {
//       const { documentBase64, name, fileId } = templates[i];
//       const cleanBase64 = String(documentBase64 || "").replace(/^data:application\/pdf;base64,/i, "").trim();
//       if (!cleanBase64) continue;

//       let pdfBuffer;
//       try { pdfBuffer = Buffer.from(cleanBase64, "base64"); } catch { continue; }
//       if (pdfBuffer.slice(0, 4).toString("utf8") !== "%PDF") continue;

//       pdfBuffers.push(pdfBuffer);

//       const pdfFileName = `${datePart}_${nowMs}-pdf-${i + 1}.pdf`;
//       await AwsFileUpload.uploadToSpaces({
//         fileData: pdfBuffer,
//         filename: pdfFileName,
//         filepath: ESIGN_PDF_PATH,
//         mimetype: "application/pdf",
//       });

//       files.push({
//         filename: name,
//         storedName: pdfFileName,
//         publicUrl: pdfFileName,
//         mimetype: "application/pdf",
//         html: documentBase64,
//         templatePdf: pdfFileName,
//         signedTemplatePdf: null,
//         fileId: fileId || "",
//       });
//     }

//     if (!files.length || !pdfBuffers.length) {
//       return res.status(400).json({ error: "No valid PDFs after processing" });
//     }

//     // -------- merge pdfs
//     const mergedPdf = await PDFDocument.create();
//     for (const buf of pdfBuffers) {
//       const pdf = await PDFDocument.load(buf);
//       const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
//       pages.forEach((p) => mergedPdf.addPage(p));
//     }
//     const mergedPdfBytes = await mergedPdf.save();
//     const mergedPdfFileName = `${datePart}_${Date.now()}-merged.pdf`;

//     // -------- create envelope
//     const signers = users.map((u) => ({
//       email: u.email,
//       name: u.name,
//       status: SIGN_EVENTS.PENDING,
//       sentAt: null,
//       tokenUrl: "",
//       metaData: u.tabs,
//       isAction: u.isAction,
//       routingOrder: u.routingOrder,
//     }));

//     let env = await Envelope.create({
//       signers,
//       files,
//       documentStatus: SIGN_EVENTS.SENT,
//       pdf: mergedPdfFileName,
//       signedPdf: "",
//       signedUrl: "",
//       contentType: "application/pdf",
//       isRoutingOrder: !!isRoutingOrder,
//     });

//     // -------- header + upload merged
//     const finalMergedBytes = await addHeaderToPdf(mergedPdfBytes, env._id);

//     const mergedUploadResult = await AwsFileUpload.uploadToSpaces({
//       fileData: finalMergedBytes,
//       filename: mergedPdfFileName,
//       filepath: ESIGN_PDF_PATH,
//       mimetype: "application/pdf",
//     });

//     const mergedPublicUrl =
//       mergedUploadResult?.publicUrl ||
//       mergedUploadResult?.Location ||
//       `${ESIGN_PDF_PATH}/${mergedPdfFileName}`;

//     env.pdf = mergedPdfFileName;
//     if ("pdfUrl" in env) env.pdfUrl = mergedPublicUrl;

//     // -------- generate token urls
//     for (let i = 0; i < env.signers.length; i++) {
//       const s = env.signers[i];
//       const token = jwt.sign({ envId: String(env._id), email: s.email, i }, JWT_SECRET);
//       env.signers[i].tokenUrl = `${SIGNING_WEB_URL}/pdf-documents?type=${token}`;
//     }
//     env.signedUrl = env.signers[0]?.tokenUrl || "";

//     // -------- routing email selection (need_to_sign only)
//     const needToSign = env.signers
//       .map((s, idx) => ({ s, idx }))
//       .filter(({ s }) => s.isAction === IS_ACTIVE_ENUM.NEED_TO_SIGN);

//     let indexesToEmail = [];
//     if (env.isRoutingOrder) {
//       const minOrder = needToSign.length ? Math.min(...needToSign.map(({ s }) => +s.routingOrder || 0)) : null;
//       indexesToEmail = needToSign.filter(({ s }) => (+s.routingOrder || 0) === minOrder).map(({ idx }) => idx);
//     } else {
//       indexesToEmail = needToSign.map(({ idx }) => idx);
//     }

//     const now = new Date();
//     indexesToEmail.forEach((i) => {
//       env.signers[i].status = SIGN_EVENTS.SENT;
//       env.signers[i].sentAt = now;
//     });

//     await env.save();

//     // -------- webhook
//     await triggerWebhookEvent(SIGN_EVENTS.SENT, STATICUSERID, { envelopeId: env._id, event: SIGN_EVENTS.SENT });

//     // -------- email first routing batch / all
//     const templatePath = path.join(__dirname, "../public/template/sendDocument.html");
//     const emailTemplateRaw = fs.readFileSync(templatePath, "utf8");
//     const docName = files[0]?.filename || "Document";

//     await Promise.all(
//       indexesToEmail.map(async (i) => {
//         const s = env.signers[i];
//         const html = emailTemplateRaw
//           .replace(/{{name}}/g, s.name || "")
//           .replace(/{{signUrl}}/g, s.tokenUrl || "")
//           .replace(/{{DocumentName}}/g, docName);
//         await sendMail(s.email, "Please sign the documents", html);
//       })
//     );

//     return res.json({
//       status: true,
//       message: "emails sent successfully",
//       envelopeId: String(env._id),
//       emailedSigners: indexesToEmail.map((i) => env.signers[i]?.email),
//       routingEnabled: env.isRoutingOrder,
//       skippedReceiveCopy: env.signers.filter((s) => s.isAction === IS_ACTIVE_ENUM.RECEIVE_COPY).map((s) => s.email),
//     });
//   } catch (e) {
//     console.error("🔥 Error in storePdf:", e);
//     return res.status(500).json({ error: "Generation failed" });
//   }
// };

PDFeSignController.storePdf = async (req, res) => {
  try {
    const { base64, userData, isRoutingOrder } = req.body;

    // 1. Parse & validate templates
    let templates = Array.isArray(base64) ? base64 : JSON.parse(base64);
    if (!Array.isArray(templates) || !templates.length) {
      return res.status(400).json({ error: "base64 must be a non-empty array" });
    }

    templates = templates
      .map((t, i) => ({
        name: t?.name || `Document-${i + 1}`,
        documentBase64: String(t?.documentBase64 || "").replace(/^data:application\/pdf;base64,/i, "").trim(),
        fileId: String(t?.fileId || "").trim(),
      }))
      .filter(t => t.documentBase64);

    if (!templates.length) {
      return res.status(400).json({ error: "No valid PDFs found (documentBase64 required)" });
    }

    // 2. Parse & validate users
    let users = Array.isArray(userData) ? userData : JSON.parse(userData);
    if (!Array.isArray(users) || !users.length) {
      return res.status(400).json({ error: "userData must be a non-empty array" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    users = users
      .map(u => ({
        name: String(u?.name || "").trim(),
        email: String(u?.email || "").trim().toLowerCase(),
        tabs: Array.isArray(u?.tabs) ? u.tabs : [],
        isAction: u?.isAction === IS_ACTIVE_ENUM.RECEIVE_COPY ? IS_ACTIVE_ENUM.RECEIVE_COPY : IS_ACTIVE_ENUM.NEED_TO_SIGN,
        routingOrder: Number(u?.routingOrder) || 0,
      }))
      .filter(u => u.email && emailRegex.test(u.email));

    if (!users.length) {
      return res.status(400).json({ error: "No valid users with correct email format" });
    }

    // 3. Process PDFs → buffers + upload originals
    const datePart = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}`;
    const nowMs = Date.now();

    const files = [];
    const pdfBuffers = [];
    const individualPdfDocs = [];

    for (let i = 0; i < templates.length; i++) {
      const { documentBase64, name, fileId } = templates[i];
      let pdfBuffer;
      try {
        pdfBuffer = Buffer.from(documentBase64, "base64");
        if (pdfBuffer.slice(0, 4).toString("utf8") !== "%PDF") continue;
      } catch {
        continue;
      }

      pdfBuffers.push(pdfBuffer);
      individualPdfDocs.push(await PDFDocument.load(pdfBuffer));

      const filename = `${datePart}_${nowMs}-pdf-${i + 1}.pdf`;

      await AwsFileUpload.uploadToSpaces({
        fileData: pdfBuffer,
        filename,
        filepath: ESIGN_PDF_PATH,
        mimetype: "application/pdf",
      });

      files.push({
        filename: name,
        storedName: filename,
        publicUrl: filename,
        mimetype: "application/pdf",
        html: documentBase64,           // will be replaced later
        templatePdf: filename,
        signedTemplatePdf: null,
        fileId: fileId || "",
      });
    }

    if (!files.length) {
      return res.status(400).json({ error: "No valid PDF files after validation" });
    }

    // 4. Merge PDFs (without header yet)
    const mergedPdf = await PDFDocument.create();
    for (const buf of pdfBuffers) {
      const pdf = await PDFDocument.load(buf);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
    }
    const mergedPdfBytes = await mergedPdf.save();

    const mergedPdfFileName = `${datePart}_${Date.now()}-merged.pdf`;

    // 5. Create envelope → get _id for header
    const signers = users.map(u => ({
      email: u.email,
      name: u.name,
      status: SIGN_EVENTS.PENDING,
      sentAt: null,
      tokenUrl: "",
      metaData: u.tabs,
      isAction: u.isAction,
      routingOrder: u.routingOrder,
    }));

    let envelope = await Envelope.create({
      signers,
      files,
      documentStatus: SIGN_EVENTS.SENT,
      pdf: mergedPdfFileName,
      signedPdf: "",
      signedUrl: "",
      contentType: "application/pdf",
      isRoutingOrder: !!isRoutingOrder,
    });

    // 6. Add header to merged PDF + upload
    const finalMergedBytes = await addHeaderToPdf(mergedPdfBytes, envelope._id);

    await AwsFileUpload.uploadToSpaces({
      fileData: finalMergedBytes,
      filename: mergedPdfFileName,
      filepath: ESIGN_PDF_PATH,
      mimetype: "application/pdf",
    });

    envelope.pdf = mergedPdfFileName;
    if ("pdfUrl" in envelope) {
      envelope.pdfUrl = `${ESIGN_PDF_PATH}/${mergedPdfFileName}`; // adjust if upload result gives better URL
    }

    // 7. Add header to EACH individual PDF → update files[i].html
    for (let i = 0; i < individualPdfDocs.length; i++) {
      const bytes = await individualPdfDocs[i].save();
      const bytesWithHeader = await addHeaderToPdf(bytes, envelope._id);
      envelope.files[i].html = Buffer.from(bytesWithHeader).toString("base64");
    }

    // 8. Generate token URLs
    for (let i = 0; i < envelope.signers.length; i++) {
      const s = envelope.signers[i];
      const token = jwt.sign(
        { envId: String(envelope._id), email: s.email, i },
        JWT_SECRET
      );
      s.tokenUrl = `${SIGNING_WEB_URL}/pdf-documents?type=${token}`;
    }
    envelope.signedUrl = envelope.signers[0]?.tokenUrl || "";

    // 9. Determine who to email first (routing logic)
    const needToSign = envelope.signers
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => s.isAction === IS_ACTIVE_ENUM.NEED_TO_SIGN);

    let toEmailIndexes = [];

    if (envelope.isRoutingOrder) {
      const minOrder = needToSign.length ? Math.min(...needToSign.map(o => o.s.routingOrder)) : null;
      toEmailIndexes = needToSign
        .filter(o => o.s.routingOrder === minOrder)
        .map(o => o.idx);
    } else {
      toEmailIndexes = needToSign.map(o => o.idx);
    }

    const now = new Date();
    toEmailIndexes.forEach(i => {
      envelope.signers[i].status = SIGN_EVENTS.SENT;
      envelope.signers[i].sentAt = now;
    });

    // 10. Save updated envelope
    await envelope.save();

    // 11. Trigger webhook
    await triggerWebhookEvent(SIGN_EVENTS.SENT, STATICUSERID, {
      envelopeId: envelope._id,
      event: SIGN_EVENTS.SENT,
    });

    // 12. Send emails
    const templatePath = path.join(__dirname, "../public/template/sendDocument.html");
    const emailTemplate = fs.readFileSync(templatePath, "utf8");
    const docName = files[0]?.filename || "Document";

    await Promise.all(
      toEmailIndexes.map(async i => {
        const signer = envelope.signers[i];
        const html = emailTemplate
          .replace(/{{name}}/g, signer.name || "")
          .replace(/{{signUrl}}/g, signer.tokenUrl || "")
          .replace(/{{DocumentName}}/g, docName);

        await sendMail(signer.email, "Please sign the documents", html);
      })
    );

    // 13. Response
    return res.json({
      status: true,
      message: "Emails sent successfully",
      envelopeId: String(envelope._id),
      emailedSigners: toEmailIndexes.map(i => envelope.signers[i]?.email),
      routingEnabled: envelope.isRoutingOrder,
      skippedReceiveCopy: envelope.signers
        .filter(s => s.isAction === IS_ACTIVE_ENUM.RECEIVE_COPY)
        .map(s => s.email),
    });

  } catch (err) {
    console.error("Error in PDFeSignController.storePdf:", err);
    return res.status(500).json({ error: "Document processing failed" });
  }
};

PDFeSignController.readPdfbyToken = async (req, res) => {
  try {
    let env = await Envelope.findById(req.envId);
    if (!env) {
      return res.status(404).json({ error: "Envelope not found" });
    }

    // find signer by index or email
    let idx = typeof req.signerIndex === "number" ? req.signerIndex : env.signers.findIndex((s) => s.email === req.signerEmail);

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

      const setEnv = { envelopeId: env._id, event: SIGN_EVENTS.DELIVERED };
      await triggerWebhookEvent(SIGN_EVENTS.DELIVERED, STATICUSERID, setEnv);
    }

    const htmlTemplates = (env.files || [])
      // .filter((f) => f.mimetype == "text/html")
      .map((f) => ({
        filename: f.filename,
        url: `${SPACES_PUBLIC_URL}/storage/pdf/${f.publicUrl}`, // Spaces URL
        mimetype: f.mimetype,
        html: f.html || null,
        fileId: f.fileId || null,
      }));


    const signature = await signatureModel.findOne({ email: req.signerEmail })
    let signatureRawData = null;
    if (signature) {
      signatureRawData = signature?.signature;
    }

    return res.json({
      status: true,
      message: "PDF loaded successfully",
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
        metaData: env.signers[idx].metaData || [],
      },
      files: env.files.map((f) => ({
        filename: f.filename,
        url: `${SPACES_PUBLIC_URL}/storage/pdf/${f.publicUrl}`,
        mimetype: f.mimetype,
      })),
      htmlTemplates,
      signatureRawData
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load envelope" });
  }
};

// without routing order support
// PDFeSignController.completePdf = async (req, res) => {
//   try {
//     const { template, location, signature } = req.body;

//     const envelopeId = req.envId;
//     const signerEmail = req.signerEmail;

//     if (!envelopeId || !signerEmail) {
//       return res.status(400).json({
//         error: "Missing envelopeId or signerEmail in request",
//       });
//     }

//     if (!Array.isArray(template) || template.length === 0) {
//       return res.status(400).json({
//         error: "template must be a non-empty array of PDF base64 strings",
//       });
//     }

//     const env = await Envelope.findOne({
//       _id: envelopeId,
//       "signers.email": signerEmail,
//     });

//     if (!env) return res.status(404).json({ error: "Envelope not found" });

//     const idx = env.signers.findIndex((s) => s.email === signerEmail);
//     if (idx < 0) {
//       return res.status(400).json({ error: "Signer not found in envelope" });
//     }

//     if (env.signers[idx].status === SIGN_EVENTS.COMPLETED) {
//       return res.status(400).json({
//         error: "This signer has already completed the document",
//       });
//     }

//     // Save / update signature for signer
//     const findSignature = await signatureModel.findOne({ email: signerEmail });
//     if (findSignature) {
//       await signatureModel.updateOne({ email: signerEmail }, { signature });
//     } else {
//       await signatureModel.create({ email: signerEmail, signature });
//     }

//     // Preserve existing files array
//     const existingFiles = Array.isArray(env.files) ? env.files : [];

//     while (existingFiles.length < template.length) {
//       existingFiles.push({
//         filename: "",
//         storedName: "",
//         publicUrl: "",
//         templatePdf: "",
//         signedTemplatePdf: "",
//         mimetype: "application/pdf",
//         html: "",
//       });
//     }

//     const datePart = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}`;

//     const signedPdfBuffersToMerge = [];
//     const invalidIndexes = [];

//     // -------- PER-TEMPLATE SIGNED PDF (signedTemplatePdf) --------
//     for (let i = 0; i < template.length; i++) {
//       const file = existingFiles[i];
//       const pdfB64 = template[i];

//       file.html = pdfB64;

//       const pdfBuffer = base64ToPdfBuffer(pdfB64);

//       if (!pdfBuffer || !pdfBuffer.length) {
//         invalidIndexes.push(i);
//         continue;
//       }

//       let pdfWithHeader = pdfBuffer;
//       try {
//         // optional: add header to each PDF
//         pdfWithHeader = await addHeaderToPdf(pdfBuffer, env._id);
//       } catch (e) {
//         // if header fails, still keep original pdf
//         pdfWithHeader = pdfBuffer;
//       }

//       const singleName = `${datePart}_${Date.now()}_signed-template-${i + 1}.pdf`;

//       await AwsFileUpload.uploadToSpaces({
//         fileData: pdfWithHeader,
//         filename: singleName,
//         filepath: ESIGN_SIGNED_PATH,
//         mimetype: "application/pdf",
//       });

//       // Update signedTemplatePdf only
//       file.mimetype = "application/pdf";
//       file.filename = file.filename || `Document-${i + 1}.pdf`;
//       file.signedTemplatePdf = singleName;

//       signedPdfBuffersToMerge.push(pdfWithHeader);
//     }

//     if (signedPdfBuffersToMerge.length === 0) {
//       return res.status(400).json({
//         error:
//           "No valid PDF content found in template array. Make sure each template[i] is a PDF base64 string (decoded buffer must start with %PDF-).",
//         invalidIndexes,
//       });
//     }

//     // -------- MERGED SIGNED PDF (env.signedPdf ONLY) --------
//     const mergedPdfBuffer = await mergePdfBuffers(signedPdfBuffersToMerge);

//     let mergedPdfWithHeader = mergedPdfBuffer;
//     try {
//       // optional: add header to merged PDF too
//       mergedPdfWithHeader = await addHeaderToPdf(mergedPdfBuffer, env._id);
//     } catch (e) {
//       mergedPdfWithHeader = mergedPdfBuffer;
//     }

//     const mergedOutputName = `${datePart}_${Date.now()}_merged-signed.pdf`;

//     await AwsFileUpload.uploadToSpaces({
//       fileData: mergedPdfWithHeader,
//       filename: mergedOutputName,
//       filepath: ESIGN_SIGNED_PATH,
//       mimetype: "application/pdf",
//     });

//     env.files = existingFiles;
//     env.signedPdf = mergedOutputName;

//     // -------- Update signer & envelope status --------
//     env.signers[idx].status = SIGN_EVENTS.COMPLETED;
//     env.signers[idx].completedAt = new Date();
//     env.signers[idx].signedUrl = mergedOutputName;
//     env.signers[idx].location = location || {};
//     env.signers[idx].ipAddress = normalizeIP(req) || "";

//     if (env.signers.every((s) => s.status === SIGN_EVENTS.COMPLETED)) {
//       env.documentStatus = SIGN_EVENTS.COMPLETED;
//     }

//     const envelopeData = await env.save();

//     const setEnv = await setEnvelopeData(envelopeData._id, SIGN_EVENTS.COMPLETED);
//     await triggerWebhookEvent(SIGN_EVENTS.COMPLETED, STATICUSERID, setEnv);

//     // -------- Completed email --------
//     const completeTemplatePath = path.join(__dirname, "../public/template/completed.html");
//     let completeEmailTemplate = fs.readFileSync(completeTemplatePath, "utf8");

//     const documentName =
//       env.files?.[0]?.filename || env.files?.[0]?.storedName || "Completed Document";

//     const completedUrl = `${SIGNING_WEB_URL}/pdf-documents?type=${req.query.type}`;

//     const emailHtml = completeEmailTemplate
//       .replace(/{{completedUrl}}/g, completedUrl)
//       .replace(/{{documentName}}/g, documentName);

//     const subject = "Tianlong Document Completed: Review The Document";
//     await sendMail(env.signers[idx].email, subject, emailHtml);

//     return res.json({
//       status: true,
//       message: "Envelope completed successfully (PDF flow)",
//       downloadUrl: completedUrl,
//       envelopeId: String(env._id),
//       signerIndex: idx,
//       signerEmail: env.signers[idx].email,
//       documentStatus: env.documentStatus,
//       files: env.files,
//       signedPdf: mergedOutputName,
//       invalidIndexes, // helpful debug
//     });
//   } catch (err) {
//     console.log("🚀 ~ err:", err)
//     return res.status(500).json({
//       error: err?.message || "Envelope completion failed (PDF flow)",
//     });
//   }
// };

// PDFeSignController.completePdf = async (req, res) => {
//   try {
//     const { template, location, signature } = req.body;

//     const envelopeId = req.envId;
//     const signerEmail = req.signerEmail;

//     if (!envelopeId || !signerEmail) {
//       return res.status(400).json({
//         error: "Missing envelopeId or signerEmail in request",
//       });
//     }

//     if (!Array.isArray(template) || template.length === 0) {
//       return res.status(400).json({
//         error: "template must be a non-empty array of PDF base64 strings",
//       });
//     }

//     const env = await Envelope.findOne({
//       _id: envelopeId,
//       "signers.email": signerEmail,
//     });

//     if (!env) return res.status(404).json({ error: "Envelope not found" });

//     const idx = env.signers.findIndex((s) => s.email === signerEmail);
//     if (idx < 0) {
//       return res.status(400).json({ error: "Signer not found in envelope" });
//     }

//     if (env.signers[idx].status === SIGN_EVENTS.COMPLETED) {
//       return res.status(400).json({
//         error: "This signer has already completed the document",
//       });
//     }

//     // -------------------------------------------------------
//     // Save / update signature for signer
//     // -------------------------------------------------------
//     const findSignature = await signatureModel.findOne({ email: signerEmail });
//     if (findSignature) {
//       await signatureModel.updateOne({ email: signerEmail }, { signature });
//     } else {
//       await signatureModel.create({ email: signerEmail, signature });
//     }

//     // -------------------------------------------------------
//     // Preserve existing files array
//     // -------------------------------------------------------
//     const existingFiles = Array.isArray(env.files) ? env.files : [];

//     while (existingFiles.length < template.length) {
//       existingFiles.push({
//         filename: "",
//         storedName: "",
//         publicUrl: "",
//         templatePdf: "",
//         signedTemplatePdf: "",
//         mimetype: "application/pdf",
//         html: "",
//         fileId: "", // keep if schema has it
//       });
//     }

//     const datePart = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}`;

//     const signedPdfBuffersToMerge = [];
//     const invalidIndexes = [];

//     // -------------------------------------------------------
//     // PER-TEMPLATE SIGNED PDF (signedTemplatePdf)
//     // -------------------------------------------------------
//     for (let i = 0; i < template.length; i++) {
//       const file = existingFiles[i];
//       const pdfB64 = template[i];

//       file.html = pdfB64;

//       const pdfBuffer = base64ToPdfBuffer(pdfB64);

//       if (!pdfBuffer || !pdfBuffer.length) {
//         invalidIndexes.push(i);
//         continue;
//       }

//       let pdfWithHeader = pdfBuffer;
//       try {
//         pdfWithHeader = await addHeaderToPdf(pdfBuffer, env._id);
//       } catch (e) {
//         pdfWithHeader = pdfBuffer;
//       }

//       const singleName = `${datePart}_${Date.now()}_signed-template-${i + 1}.pdf`;

//       await AwsFileUpload.uploadToSpaces({
//         fileData: pdfWithHeader,
//         filename: singleName,
//         filepath: ESIGN_SIGNED_PATH,
//         mimetype: "application/pdf",
//       });

//       file.mimetype = "application/pdf";
//       file.filename = file.filename || `Document-${i + 1}.pdf`;
//       file.signedTemplatePdf = singleName;

//       signedPdfBuffersToMerge.push(pdfWithHeader);
//     }

//     if (signedPdfBuffersToMerge.length === 0) {
//       return res.status(400).json({
//         error:
//           "No valid PDF content found in template array. Make sure each template[i] is a PDF base64 string (decoded buffer must start with %PDF-).",
//         invalidIndexes,
//       });
//     }

//     // -------------------------------------------------------
//     // MERGED SIGNED PDF (env.signedPdf ONLY)
//     // -------------------------------------------------------
//     const mergedPdfBuffer = await mergePdfBuffers(signedPdfBuffersToMerge);

//     let mergedPdfWithHeader = mergedPdfBuffer;
//     try {
//       mergedPdfWithHeader = await addHeaderToPdf(mergedPdfBuffer, env._id);
//     } catch (e) {
//       mergedPdfWithHeader = mergedPdfBuffer;
//     }

//     const mergedOutputName = `${datePart}_${Date.now()}_merged-signed.pdf`;

//     await AwsFileUpload.uploadToSpaces({
//       fileData: mergedPdfWithHeader,
//       filename: mergedOutputName,
//       filepath: ESIGN_SIGNED_PATH,
//       mimetype: "application/pdf",
//     });

//     env.files = existingFiles;
//     env.signedPdf = mergedOutputName;

//     // -------------------------------------------------------
//     // Update signer details
//     // -------------------------------------------------------
//     env.signers[idx].status = SIGN_EVENTS.COMPLETED;
//     env.signers[idx].completedAt = new Date();
//     env.signers[idx].signedUrl = mergedOutputName;
//     env.signers[idx].location = location || {};
//     env.signers[idx].ipAddress = normalizeIP(req) || "";

//     // -------------------------------------------------------
//     // Helper: check completion only for need_to_sign users
//     // -------------------------------------------------------
//     const allNeedToSignCompleted = () => {
//       return env.signers
//         .filter((s) => (s.isAction || "need_to_sign") === "need_to_sign")
//         .every((s) => s.status === SIGN_EVENTS.COMPLETED);
//     };

//     const getNextRoutingOrder = () => {
//       const pending = env.signers.filter(
//         (s) =>
//           (s.isAction || "need_to_sign") === "need_to_sign" &&
//           s.status === SIGN_EVENTS.PENDING
//       );
//       if (!pending.length) return null;
//       return Math.min(...pending.map((s) => +s.routingOrder || 0));
//     };

//     const getRoutingIndexes = (order) => {
//       const ids = [];
//       env.signers.forEach((s, i) => {
//         if (
//           (s.isAction || "need_to_sign") === "need_to_sign" &&
//           s.status === SIGN_EVENTS.PENDING &&
//           (+s.routingOrder || 0) === (+order || 0)
//         ) {
//           ids.push(i);
//         }
//       });
//       return ids;
//     };

//     // -------------------------------------------------------
//     // Routing logic: update envelope status
//     // - IMPORTANT: your previous code used all signers; we must ignore receive_copy
//     // -------------------------------------------------------
//     if (allNeedToSignCompleted()) {
//       env.documentStatus = SIGN_EVENTS.COMPLETED;
//     }

//     // save now (so statuses persist)
//     const envelopeData = await env.save();

//     // webhook: completed only when documentStatus completed
//     if (env.documentStatus === SIGN_EVENTS.COMPLETED) {
//       const setEnv = await setEnvelopeData(envelopeData._id, SIGN_EVENTS.COMPLETED);
//       await triggerWebhookEvent(SIGN_EVENTS.COMPLETED, STATICUSERID, setEnv);
//     }

//     // -------------------------------------------------------
//     // Completed mail template (your existing)
//     // -------------------------------------------------------
//     const completeTemplatePath = path.join(
//       __dirname,
//       "../public/template/completed.html"
//     );
//     let completeEmailTemplate = fs.readFileSync(completeTemplatePath, "utf8");

//     const documentName =
//       env.files?.[0]?.filename || env.files?.[0]?.storedName || "Completed Document";

//     // keep your existing completedUrl behavior
//     const completedUrl = `${SIGNING_WEB_URL}/pdf-documents?type=${req.query.type}`;

//     const completedEmailHtml = completeEmailTemplate
//       .replace(/{{completedUrl}}/g, completedUrl)
//       .replace(/{{documentName}}/g, documentName);

//     // send completed mail to current signer (same as your code)
//     const completedSubject = "Tianlong Document Completed: Review The Document";
//     await sendMail(env.signers[idx].email, completedSubject, completedEmailHtml);

//     // -------------------------------------------------------
//     // 1) If envelope fully completed => send receive_copy emails + mark them completed
//     // -------------------------------------------------------
//     const receiveCopyEmailsSent = [];
//     if (env.documentStatus === SIGN_EVENTS.COMPLETED) {
//       // mark receive_copy signers as COMPLETED + send email
//       const receiveCopies = env.signers
//         .map((s, i) => ({ s, i }))
//         .filter(({ s }) => (s.isAction || "") === "receive_copy");

//       if (receiveCopies.length) {
//         const now = new Date();
//         receiveCopies.forEach(({ i }) => {
//           env.signers[i].status = SIGN_EVENTS.COMPLETED;
//           env.signers[i].completedAt = now;
//         });

//         await env.save();

//         await Promise.all(
//           receiveCopies.map(async ({ s }) => {
//             const html = completeEmailTemplate
//               .replace(/{{completedUrl}}/g, completedUrl)
//               .replace(/{{documentName}}/g, documentName);

//             await sendMail(s.email, "Completed document copy", html);
//             receiveCopyEmailsSent.push(s.email);
//           })
//         );
//       }
//     }

//     // -------------------------------------------------------
//     // 2) If routing enabled and not completed => send next routing batch sign emails
//     // -------------------------------------------------------
//     const nextRoutingEmailsSent = [];

//     if (env.isRoutingOrder && env.documentStatus !== SIGN_EVENTS.COMPLETED) {
//       const nextOrder = getNextRoutingOrder();

//       if (nextOrder !== null) {
//         const nextIndexes = getRoutingIndexes(nextOrder);

//         if (nextIndexes.length) {
//           // sendDocument template
//           const sendTemplatePath = path.join(
//             __dirname,
//             "../public/template/sendDocument.html"
//           );
//           const sendEmailTemplateRaw = fs.readFileSync(sendTemplatePath, "utf8");

//           const now = new Date();

//           // Mark next batch as SENT
//           nextIndexes.forEach((i) => {
//             env.signers[i].status = SIGN_EVENTS.SENT;
//             env.signers[i].sentAt = now;
//           });

//           await env.save();

//           await Promise.all(
//             nextIndexes.map(async (i) => {
//               const s = env.signers[i];

//               const signUrl = s.tokenUrl; // already generated in storePdf
//               const emailHtml = sendEmailTemplateRaw
//                 .replace(/{{name}}/g, s.name || "")
//                 .replace(/{{signUrl}}/g, signUrl || "")
//                 .replace(/{{DocumentName}}/g, documentName);

//               await sendMail(s.email, "Please sign the documents", emailHtml);
//               nextRoutingEmailsSent.push(s.email);
//             })
//           );
//         }
//       }
//     }

//     return res.json({
//       status: true,
//       message: "Envelope completed successfully (PDF flow)",
//       downloadUrl: completedUrl,
//       envelopeId: String(env._id),
//       signerIndex: idx,
//       signerEmail: env.signers[idx].email,
//       documentStatus: env.documentStatus,
//       files: env.files,
//       signedPdf: mergedOutputName,
//       invalidIndexes,

//       // debug/helpful
//       isRoutingOrder: !!env.isRoutingOrder,
//       nextRoutingEmailsSent,
//       receiveCopyEmailsSent,
//     });
//   } catch (err) {
//     console.log("🚀 ~ err:", err);
//     return res.status(500).json({
//       error: err?.message || "Envelope completion failed (PDF flow)",
//     });
//   }
// };

PDFeSignController.completePdf = async (req, res) => {
  try {
    const { template, location, signature } = req.body;

    const envelopeId = req.envId;
    const signerEmail = req.signerEmail;

    if (!envelopeId || !signerEmail) {
      return res.status(400).json({
        error: "Missing envelopeId or signerEmail in request",
      });
    }

    if (!Array.isArray(template) || template.length === 0) {
      return res.status(400).json({
        error: "template must be a non-empty array of PDF base64 strings",
      });
    }

    const env = await Envelope.findOne({
      _id: envelopeId,
      "signers.email": signerEmail,
    });

    if (!env) return res.status(404).json({ error: "Envelope not found" });

    const idx = env.signers.findIndex((s) => s.email === signerEmail);
    if (idx < 0) {
      return res.status(400).json({ error: "Signer not found in envelope" });
    }

    if (env.signers[idx].status === SIGN_EVENTS.COMPLETED) {
      return res.status(400).json({
        error: "This signer has already completed the document",
      });
    }

    // -------------------------------------------------------
    // Save / update signature for signer
    // -------------------------------------------------------
    const findSignature = await signatureModel.findOne({ email: signerEmail });
    if (findSignature) {
      await signatureModel.updateOne({ email: signerEmail }, { signature });
    } else {
      await signatureModel.create({ email: signerEmail, signature });
    }

    // -------------------------------------------------------
    // Preserve existing files array
    // -------------------------------------------------------
    const existingFiles = Array.isArray(env.files) ? env.files : [];

    while (existingFiles.length < template.length) {
      existingFiles.push({
        filename: "",
        storedName: "",
        publicUrl: "",
        templatePdf: "",
        signedTemplatePdf: "",
        mimetype: "application/pdf",
        html: "",
        fileId: "",
      });
    }

    const datePart = `${getCurrentDayInNumber()}-${getCurrentMOnth()}-${getCurrentYear()}`;

    const signedPdfBuffersToMerge = [];
    const invalidIndexes = [];

    // -------------------------------------------------------
    // PER-TEMPLATE SIGNED PDF → upload + base64 with header
    // -------------------------------------------------------
    for (let i = 0; i < template.length; i++) {
      const file = existingFiles[i];
      const pdfB64 = template[i];

      const pdfBuffer = base64ToPdfBuffer(pdfB64);

      if (!pdfBuffer || !pdfBuffer.length) {
        invalidIndexes.push(i);
        continue;
      }

      let pdfWithHeader = pdfBuffer;
      try {
        pdfWithHeader = await addHeaderToPdf(pdfBuffer, env._id);
      } catch (e) {
        pdfWithHeader = pdfBuffer;
      }

      // ── FIXED: full data URI base64 (most frontends expect this format) ──
      const signedBase64 = `${Buffer.from(pdfWithHeader).toString("base64")}`;
      file.html = signedBase64;

      const singleName = `${datePart}_${Date.now()}_signed-template-${i + 1}.pdf`;

      await AwsFileUpload.uploadToSpaces({
        fileData: pdfWithHeader,
        filename: singleName,
        filepath: ESIGN_SIGNED_PATH,
        mimetype: "application/pdf",
      });

      file.mimetype = "application/pdf";
      file.filename = file.filename || `Document-${i + 1}.pdf`;
      file.signedTemplatePdf = singleName;

      signedPdfBuffersToMerge.push(pdfWithHeader);
    }

    if (signedPdfBuffersToMerge.length === 0) {
      return res.status(400).json({
        error:
          "No valid PDF content found in template array. Make sure each template[i] is a PDF base64 string (decoded buffer must start with %PDF-).",
        invalidIndexes,
      });
    }

    // -------------------------------------------------------
    // MERGED SIGNED PDF (env.signedPdf ONLY)
    // -------------------------------------------------------
    const mergedPdfBuffer = await mergePdfBuffers(signedPdfBuffersToMerge);

    let mergedPdfWithHeader = mergedPdfBuffer;
    try {
      mergedPdfWithHeader = await addHeaderToPdf(mergedPdfBuffer, env._id);
    } catch (e) {
      mergedPdfWithHeader = mergedPdfBuffer;
    }

    const mergedOutputName = `${datePart}_${Date.now()}_merged-signed.pdf`;

    await AwsFileUpload.uploadToSpaces({
      fileData: mergedPdfWithHeader,
      filename: mergedOutputName,
      filepath: ESIGN_SIGNED_PATH,
      mimetype: "application/pdf",
    });

    env.files = existingFiles;
    env.signedPdf = mergedOutputName;

    // -------------------------------------------------------
    // Update signer details
    // -------------------------------------------------------
    env.signers[idx].status = SIGN_EVENTS.COMPLETED;
    env.signers[idx].completedAt = new Date();
    env.signers[idx].signedUrl = mergedOutputName;
    env.signers[idx].location = location || {};
    env.signers[idx].ipAddress = normalizeIP(req) || "";

    // -------------------------------------------------------
    // Helper: check completion only for need_to_sign users
    // -------------------------------------------------------
    const allNeedToSignCompleted = () => {
      return env.signers
        .filter((s) => (s.isAction || "need_to_sign") === "need_to_sign")
        .every((s) => s.status === SIGN_EVENTS.COMPLETED);
    };

    const getNextRoutingOrder = () => {
      const pending = env.signers.filter(
        (s) =>
          (s.isAction || "need_to_sign") === "need_to_sign" &&
          s.status === SIGN_EVENTS.PENDING
      );
      if (!pending.length) return null;
      return Math.min(...pending.map((s) => +s.routingOrder || 0));
    };

    const getRoutingIndexes = (order) => {
      const ids = [];
      env.signers.forEach((s, i) => {
        if (
          (s.isAction || "need_to_sign") === "need_to_sign" &&
          s.status === SIGN_EVENTS.PENDING &&
          (+s.routingOrder || 0) === (+order || 0)
        ) {
          ids.push(i);
        }
      });
      return ids;
    };

    // -------------------------------------------------------
    // Routing logic: update envelope status
    // -------------------------------------------------------
    if (allNeedToSignCompleted()) {
      env.documentStatus = SIGN_EVENTS.COMPLETED;
    }

    // save now (so statuses persist)
    const envelopeData = await env.save();

    // webhook: completed only when documentStatus completed
    if (env.documentStatus === SIGN_EVENTS.COMPLETED) {
      const setEnv = await setEnvelopeData(envelopeData._id, SIGN_EVENTS.COMPLETED);
      await triggerWebhookEvent(SIGN_EVENTS.COMPLETED, STATICUSERID, setEnv);
    }

    // -------------------------------------------------------
    // Completed mail template
    // -------------------------------------------------------
    const completeTemplatePath = path.join(
      __dirname,
      "../public/template/completed.html"
    );
    let completeEmailTemplate = fs.readFileSync(completeTemplatePath, "utf8");

    const documentName =
      env.files?.[0]?.filename || env.files?.[0]?.storedName || "Completed Document";

    const completedUrl = `${SIGNING_WEB_URL}/pdf-documents?type=${req.query.type}`;

    const completedEmailHtml = completeEmailTemplate
      .replace(/{{completedUrl}}/g, completedUrl)
      .replace(/{{documentName}}/g, documentName);

    // send completed mail to current signer
    const completedSubject = "Tianlong Document Completed: Review The Document";
    await sendMail(env.signers[idx].email, completedSubject, completedEmailHtml);

    // -------------------------------------------------------
    // 1) If envelope fully completed => send receive_copy emails + mark them completed
    // -------------------------------------------------------
    const receiveCopyEmailsSent = [];
    if (env.documentStatus === SIGN_EVENTS.COMPLETED) {
      const receiveCopies = env.signers
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => (s.isAction || "") === "receive_copy");

      if (receiveCopies.length) {
        const now = new Date();
        receiveCopies.forEach(({ i }) => {
          env.signers[i].status = SIGN_EVENTS.COMPLETED;
          env.signers[i].completedAt = now;
        });

        await env.save();

        await Promise.all(
          receiveCopies.map(async ({ s }) => {
            const html = completeEmailTemplate
              .replace(/{{completedUrl}}/g, completedUrl)
              .replace(/{{documentName}}/g, documentName);

            await sendMail(s.email, "Completed document copy", html);
            receiveCopyEmailsSent.push(s.email);
          })
        );
      }
    }

    // -------------------------------------------------------
    // 2) If routing enabled and not completed => send next routing batch
    // -------------------------------------------------------
    const nextRoutingEmailsSent = [];

    if (env.isRoutingOrder && env.documentStatus !== SIGN_EVENTS.COMPLETED) {
      const nextOrder = getNextRoutingOrder();

      if (nextOrder !== null) {
        const nextIndexes = getRoutingIndexes(nextOrder);

        if (nextIndexes.length) {
          const sendTemplatePath = path.join(
            __dirname,
            "../public/template/sendDocument.html"
          );
          const sendEmailTemplateRaw = fs.readFileSync(sendTemplatePath, "utf8");

          const now = new Date();

          nextIndexes.forEach((i) => {
            env.signers[i].status = SIGN_EVENTS.SENT;
            env.signers[i].sentAt = now;
          });

          await env.save();

          await Promise.all(
            nextIndexes.map(async (i) => {
              const s = env.signers[i];

              const signUrl = s.tokenUrl;
              const emailHtml = sendEmailTemplateRaw
                .replace(/{{name}}/g, s.name || "")
                .replace(/{{signUrl}}/g, signUrl || "")
                .replace(/{{DocumentName}}/g, documentName);

              await sendMail(s.email, "Please sign the documents", emailHtml);
              nextRoutingEmailsSent.push(s.email);
            })
          );
        }
      }
    }

    return res.json({
      status: true,
      message: "Envelope completed successfully (PDF flow)",
      downloadUrl: completedUrl,
      envelopeId: String(env._id),
      signerIndex: idx,
      signerEmail: env.signers[idx].email,
      documentStatus: env.documentStatus,
      files: env.files,               // now contains full data:application/pdf;base64,... in .html
      signedPdf: mergedOutputName,
      invalidIndexes,

      isRoutingOrder: !!env.isRoutingOrder,
      nextRoutingEmailsSent,
      receiveCopyEmailsSent,
    });
  } catch (err) {
    console.error("Error in completePdf:", err);
    return res.status(500).json({
      error: err?.message || "Envelope completion failed (PDF flow)",
    });
  }
};















module.exports = PDFeSignController;