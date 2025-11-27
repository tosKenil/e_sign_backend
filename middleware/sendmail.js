// const axios = require('axios');
// async function sendMail(to, subject, body) {
//     try {
//         const response = await axios.post(
//             'https://api.brevo.com/v3/smtp/email',
//             {
//                 sender: { name: process.env.FROM_NAME, email: process.env.FROM_EMAIL },
//                 to: [{ email: to }],
//                 subject,
//                 htmlContent: body,
//             },
//             {
//                 headers: {
//                     'api-key': process.env.BREVO_API_KEY,
//                     'Content-Type': 'application/json',
//                 },
//             }
//         );
//         console.log("🚀 ~ sendMail ~ response.data:", response.data)
//         return response.data;
//     } catch (error) {
//         console.log("🚀 ~ sendMail ~ error:", error.message)
//         throw error;
//     }
// }


const nodemailer = require('nodemailer');


var transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: "theoceanstudios2020@gmail.com",
        pass: 'mvuc iivy knry vuea'
    },
    tls: {
        rejectUnauthorized: false
    }
});
const sendMail = function (to, subject, body) {
    const senderName = process.env.APPNAME || "e-sign";

    const safeTo = process.env.NODE_ENV === "production" ? to : "kenil.dev@theoceanstudios.in";

    let message = {
        from: 'theoceanstudios2020@gmail.com',
        to: to,
        subject: subject,
        html: body,
    }
    transport.sendMail(message, function (err, info) {
        if (err) {
            console.log(err)
        } else {
            console.log("Message sent successfully");
        }
    })
};

module.exports = sendMail;