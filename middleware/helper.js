const helpers = {}
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const fs = require("fs");
const puppeteer = require("puppeteer");
const chromium = require("@sparticuz/chromium");
const puppeteer_core = require("puppeteer-core");
const moment = require("moment");



helpers.verifyJWT = async (req, res, next) => {
    const token = req.query.token;
    if (!token) return res.status(401).json({ error: "Missing token" });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid token" });
        // decoded: { envId, email, i, iat, exp }
        req.envId = decoded.envId || decoded._id; // _id fallback if you ever used older tokens
        req.signerEmail = decoded.email;
        req.signerIndex =
            typeof decoded.i === "number" ? decoded.i : undefined;
        next();
    });
}

// ---------- API KEY MIDDLEWARE ----------
helpers.verifyApiKey = async (req, res, next) => {
    // Allow key via header (you used 'api-key')
    const headerKey = req.headers["api-key"];
    const key = headerKey;

    if (!API_KEY) {
        console.error("API_KEY not configured on server");
        return res
            .status(500)
            .json({ error: "Server API key not configured" });
    }

    if (!key || key !== API_KEY) {
        return res.status(401).json({ error: "Invalid or missing API key" });
    }

    next();
}

helpers.generatePdfDocumentFromTemplate = async ({
    templatePath,
    outputName,
    data,
    landscape = false,
}) => {
    let html = fs.readFileSync(templatePath, 'utf-8');

    if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
            const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            html = html.replace(pattern, value);
        }
    }

    let pdfBuffer = null;

    // If you want to generate a real PDF when landscape === true
    if (landscape === true) {
        let browser;
        if (process.env.NODE_ENV === "development") {

            browser = await puppeteer.launch({ args: ['--no-sandbox'] });
        } else {
            browser = await puppeteer_core.launch({
                args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
            });
        }

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        pdfBuffer = Buffer.from(
            await page.pdf({
                format: 'A4',
                landscape,
                printBackground: true,
            })
        );
        await browser.close();
    }

    // 👇 Always return a valid Buffer:
    // - if PDF was generated → use that
    // - otherwise → fall back to HTML buffer
    const fileBuffer = pdfBuffer || Buffer.from(html, 'utf-8');

    return {
        name: outputName,
        file: fileBuffer,
    };
};

function extractHeadFragments(htmlStr = "") {
    const styles = [];
    const links = [];

    const styleMatches = htmlStr.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    if (styleMatches) styles.push(...styleMatches);

    const linkMatches = htmlStr.match(
        /<link[^>]+rel=["']stylesheet["'][^>]*>/gi
    );
    if (linkMatches) links.push(...linkMatches);

    return { styles, links };
}


function extractBody(htmlStr = "") {
    const bodyMatch = htmlStr.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) return bodyMatch[1];
    return htmlStr;
}

helpers.buildFullPdfHtml = (pagesHtml = []) => {
    const collectedStyles = [];
    const collectedLinks = [];

    // Collect styles/links from all templates
    pagesHtml.forEach((htmlStr) => {
        if (!htmlStr || !htmlStr.trim()) return;
        const { styles, links } = extractHeadFragments(htmlStr);
        if (styles.length) collectedStyles.push(...styles);
        if (links.length) collectedLinks.push(...links);
    });

    const headCss = `
        <style>
            @page {
                size: A4;
                margin: 15mm;
            }
            html, body {
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                font-family: Arial, sans-serif;
            }
            .pdf-page {
                margin: 0;
                padding: 0;
            }
            .page-break {
                page-break-after: always;
            }
        </style>
    `;

    const headContent = `
        <meta charset="utf-8" />
        ${collectedLinks.join("\n")}
        ${collectedStyles.join("\n")}
        ${headCss}
    `;

    let bodyContent = "";

    if (pagesHtml.length === 1) {
        // ✅ SINGLE TEMPLATE → continuous content, no manual page-breaks
        const singleBody = extractBody(pagesHtml[0]);
        bodyContent = `
            <div class="pdf-page">
                ${singleBody}
            </div>
        `;
    } else {
        // ✅ MULTIPLE TEMPLATES → each one starts on a new page
        const bodyPages = pagesHtml
            .map((htmlStr) => (htmlStr || "").trim())
            .filter(Boolean)
            .map((htmlStr) => extractBody(htmlStr));

        bodyContent = bodyPages
            .map((pageHtml, index) => {
                const needsBreak = index < bodyPages.length - 1;
                return `
                    <div class="pdf-page">
                        ${pageHtml}
                    </div>
                    ${needsBreak ? '<div class="page-break"></div>' : ""}
                `;
            })
            .join("\n");
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            ${headContent}
        </head>
        <body>
            ${bodyContent}
        </body>
        </html>
    `;
}


helpers.getCurrentDayInNumber = () => {
    const currentDayOfMonth = moment().format('D');
    return currentDayOfMonth; // All keys are valid
};
helpers.getCurrentMOnth = () => {
    const currentMonth = moment().format('M');
    return currentMonth; // All keys are valid
};
helpers.getCurrentYear = () => {
    const currentYear = moment().format('YYYY');
    return currentYear; // All keys are valid
};



helpers.normalizeIP = (req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress;
    return ip?.replace('::ffff:', '') || ip;

}




module.exports = helpers