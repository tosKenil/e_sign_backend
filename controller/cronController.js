require('dotenv').config();
const { MongoClient } = require('mongodb');

// ---------- SINGLE FUNCTION: EXPORT + IMPORT ----------
const backupDatabaseToLocal = async () => {
    const REMOTE_DB_URL = process.env.DB_URL
    const LOCAL_DB_URL = process.env.MONGO_LOCAL_URL || 'mongodb://127.0.0.1:27017/ttSign';

    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const now = new Date();
    // New DB name for backup in local
    const backupDbName = `ttSignBackup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

    let remoteClient;
    let localClient;

    try {
        // ---------- CONNECT TO REMOTE ----------
        remoteClient = new MongoClient(REMOTE_DB_URL);
        await remoteClient.connect();

        const remoteDbName = new URL(REMOTE_DB_URL).pathname.replace(/^\//, '');
        if (!remoteDbName) {
            throw new Error('Could not detect remote DB name from connection string');
        }

        const remoteDb = remoteClient.db(remoteDbName);

        // ---------- EXPORT DATA FROM REMOTE (IN MEMORY) ----------
        const collectionsInfo = await remoteDb.listCollections().toArray();
        const exportData = {};

        for (const collectionInfo of collectionsInfo) {
            const collectionName = collectionInfo.name;
            const collection = remoteDb.collection(collectionName);

            // Sample doc → simple schema (optional)
            const sampleDocument = await collection.findOne();
            const schema = {};
            if (sampleDocument) {
                for (const key in sampleDocument) {
                    schema[key] = typeof sampleDocument[key];
                }
            }

            // All docs
            const data = await collection.find().toArray();

            exportData[collectionName] = {
                schema,
                data,
            };

        }

        // ---------- CONNECT TO LOCAL ----------
        localClient = new MongoClient(LOCAL_DB_URL);
        await localClient.connect();

        const localDb = localClient.db(backupDbName);

        // ---------- IMPORT DATA TO LOCAL (DIRECT, NO FILE) ----------
        for (const collectionName in exportData) {
            const collectionData = exportData[collectionName];
            const collection = localDb.collection(collectionName);

            // Drop if exists
            const existingCollections = await localDb
                .listCollections({ name: collectionName })
                .toArray();

            if (existingCollections.length > 0) {
                await collection.drop();
            }

            // Recreate and insert
            if (collectionData.data && collectionData.data.length > 0) {
                await localDb.createCollection(collectionName);
                await collection.insertMany(collectionData.data);
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