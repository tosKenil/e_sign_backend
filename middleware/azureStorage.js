const { BlobServiceClient } = require("@azure/storage-blob");

const AZURE_STORAGE_CONNECTION_STRING =
    process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING is not set in environment variables"
    );
}

async function uploadBufferToAzure({
    buffer,
    containerName,
    blobName,
    contentType,
}) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
        AZURE_STORAGE_CONNECTION_STRING
    );

    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const options = {};
    if (contentType) {
        options.blobHTTPHeaders = { blobContentType: contentType };
    }

    await blockBlobClient.uploadData(buffer, options);

    return {
        url: blockBlobClient.url,
        containerName,
        blobName,
    };
}

module.exports = {
    uploadBufferToAzure,
};
