require('dotenv').config();
const { MongoClient } = require('mongodb');

// ---------- SINGLE FUNCTION: EXPORT + IMPORT ----------
const backupDatabaseToLocal = async () => {
    const REMOTE_DB_URL = process.env.DB_URL
    const LOCAL_DB_URL = process.env.MONGO_LOCAL_URL || 'mongodb://127.0.0.1:27017/ttSign';

    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const now = new Date();

    // ⬇️ DATE ONLY (no time)
    const backupDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const backupDbName = `ttSignBackup_${backupDate}`;

    let remoteClient;
    let localClient;

    try {
        // ---------- CONNECT TO LOCAL FIRST ----------
        localClient = new MongoClient(LOCAL_DB_URL);
        await localClient.connect();

        const admin = localClient.db().admin();
        const { databases } = await admin.listDatabases();

        const alreadyExists = databases.some(
            (db) => db.name === backupDbName
        );

        if (alreadyExists) {
            return;
        }

        // ---------- CONNECT TO REMOTE ----------
        remoteClient = new MongoClient(REMOTE_DB_URL);
        await remoteClient.connect();

        const remoteDbName = new URL(REMOTE_DB_URL).pathname.replace(/^\//, '');
        if (!remoteDbName) {
            throw new Error('Could not detect remote DB name from connection string');
        }

        const remoteDb = remoteClient.db(remoteDbName);

        // ---------- EXPORT ----------
        const collectionsInfo = await remoteDb.listCollections().toArray();
        const exportData = {};

        for (const { name } of collectionsInfo) {
            const collection = remoteDb.collection(name);
            const data = await collection.find().toArray();

            exportData[name] = { data };
        }

        // ---------- IMPORT ----------
        const localDb = localClient.db(backupDbName);

        for (const collectionName in exportData) {
            const docs = exportData[collectionName].data;
            if (docs.length) {
                await localDb.collection(collectionName).insertMany(docs);
            }
        }


    } catch (err) {
        console.error('❌ Error in backup job:', err);
    } finally {
        if (remoteClient) await remoteClient.close();
        if (localClient) await localClient.close();
    }
};

module.exports = backupDatabaseToLocal;
