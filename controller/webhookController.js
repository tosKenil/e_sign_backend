const { WEBHOOK_EVENTS } = require("../config/contance");

const webhookController = {};

webhookController.registerWebhook = async (req, res) => {
    const { company_id, url, events } = req.body;

    const secret_key = crypto.randomBytes(32).toString("hex");

    const webhook = await Webhook.create({
        company_id,
        url,
        events,
        secret_key,
        status: WEBHOOK_EVENTS.ACTIVE
    });

    res.json({ message: "Webhook Registered", webhook });
}



module.exports = webhookController;


