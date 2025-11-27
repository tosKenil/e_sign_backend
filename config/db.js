const mongoose = require("mongoose");

mongoose.connect(process.env.DB_URL)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });

