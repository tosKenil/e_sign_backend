require('dotenv').config();
const { MongoClient } = require('mongodb');

const backupDatabaseToLocal = async () => {
    const REMOTE_DB_URL = process.env.DB_URL;
    const BACKUP_DB_URL = process.env.MONGO_BACKUP_URL;

    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const now = new Date();

    const dateSuffix = `${pad(now.getDate())}-${pad(
        now.getMonth() + 1
    )}-${now.getFullYear()}`;

    let remoteClient;
    let backupClient;

    try {
        // ---------- CONNECT REMOTE ----------
        remoteClient = new MongoClient(REMOTE_DB_URL);
        await remoteClient.connect();

        const remoteDbName = new URL(REMOTE_DB_URL).pathname.replace(/^\//, '');
        const backupDbName = `${remoteDbName}_${dateSuffix}`;

        const remoteDb = remoteClient.db(remoteDbName);

        // ---------- CONNECT BACKUP ----------
        backupClient = new MongoClient(BACKUP_DB_URL);
        await backupClient.connect();

        const backupDb = backupClient.db(backupDbName);

        const collections = await remoteDb
            .listCollections({}, { nameOnly: false })
            .toArray();

        for (const col of collections) {
            if (col.type !== 'collection') continue;

            // 🔒 CHECK IF COLLECTION ALREADY EXISTS IN BACKUP DB
            const exists = await backupDb
                .listCollections({ name: col.name })
                .hasNext();

            if (exists) {
                console.log(`⏭️ Skipping existing collection: ${col.name}`);
                continue;
            }

            const sourceCol = remoteDb.collection(col.name);
            const targetCol = backupDb.collection(col.name);

            // ✅ Create empty collection explicitly
            await targetCol.insertOne({ __init: true });
            await targetCol.deleteMany({ __init: true });

            const docs = await sourceCol.find().toArray();

            if (docs.length) {
                await targetCol.insertMany(docs);
            }

            console.log(`✅ Backed up collection: ${col.name}`);
        }

        console.log(`🎉 Backup completed: ${backupDbName}`);

    } catch (err) {
        console.error('❌ Backup failed:', err);
    } finally {
        if (remoteClient) await remoteClient.close();
        if (backupClient) await backupClient.close();
    }
};

module.exports = backupDatabaseToLocal;
