const { MongoClient, ObjectId } = require('mongodb');
const csv = require('fast-csv');
const fs = require('fs');
const path = require('path');
const process = require('process');

// MongoDB connection URI
// Dev: "mongodb://user:pw@localhost:5555/epic"
const URI = "mongodb://localhost/epic"; // Local
const DATABASE_NAME = "epic";
const COMPLIANCE = "Inspection";
const VALUED_COMPONENTS = "Vc";
const PROJECT_CAC = "CACUser";
const collectionConfig = [
    { collectionName: COMPLIANCE, lastDocumentIdFile: `lastDocumentId_${COMPLIANCE}.txt`, backupFileName: `backup_${COMPLIANCE}.csv` },
    { collectionName: VALUED_COMPONENTS, lastDocumentIdFile: `lastDocumentId_${VALUED_COMPONENTS}.txt`, backupFileName: `backup_${VALUED_COMPONENTS}.csv` },
    { collectionName: PROJECT_CAC, lastDocumentIdFile: `lastDocumentId_${PROJECT_CAC}.txt`, backupFileName: `backup_${PROJECT_CAC}.csv` },
]

/**
 * Get backup directory. 
 * If script argument --backUpDir set, use provided dir to continue previous backup
 */
function getBackUpDir() {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const arg = process.argv[2];
    const backUpDirArg = arg ? arg.replace('--backUpDir=', '') : null;
    const backupDirectory = backUpDirArg || `${timestamp}_ComplianceProjCacVc_Backup`;
    // Create the backup directory if it doesn't exist
    if (!fs.existsSync(backupDirectory)) {
        fs.mkdirSync(backupDirectory);
        console.log("Back up dir created: ", backupDirectory);
    }
    else {
        console.log("Back up dir found: ", backupDirectory);
    }
    return backupDirectory;
}

/**
 * Query and return all data from the collection with id greater than last document id
 */
async function getDataFromCollection(db, collection, lastDocumentId) {
    const query = lastDocumentId ? { _schemaName: collection, _id: { $gt: ObjectId(lastDocumentId) } } : { _schemaName: collection };
    return new Promise(function (resolve, reject) {
        db.collection(DATABASE_NAME).find(query)
            .sort({ _id: 1 })
            .toArray()
            .then(async function (data) {
                resolve(data);
            });
    });
}

/**
 * Appends data to csv file.
 */
function appendDataToCSVBackup(fullBackupFilePath, documents) {
    const csvStream = csv.format({ headers: false });
    const writableStream = fs.createWriteStream(fullBackupFilePath, { flags: 'a' });
    documents.forEach((document) => csvStream.write(Object.values(document)));
    csvStream.pipe(writableStream);
    csvStream.end();
}

/**
 * Export data from the specified collection and database
 */
async function exportData() {
    let client;
    try {
        const backupDirectory = getBackUpDir()

        // Connect to MongoDB
        client = new MongoClient(URI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        console.log("Connection opened.")
        const db = client.db(DATABASE_NAME);

        // Query each collection
        for (const { collectionName, lastDocumentIdFile, backupFileName } of collectionConfig) {
            const fullBackupFilePath = path.join(backupDirectory, backupFileName);
            const fullLastDocIdPath = path.join(backupDirectory, lastDocumentIdFile)
            let lastDocumentId = fs.existsSync(fullLastDocIdPath) ? fs.readFileSync(fullLastDocIdPath, 'utf8') : null;

            const documents = await getDataFromCollection(db, collectionName, lastDocumentId)
            console.log(`${collectionName} document count: ${documents.length}`);

            if (documents.length > 0) {
                // Write last document ID
                fs.writeFileSync(fullLastDocIdPath, documents[documents.length - 1]._id.toString());

                // If the backup file does not exist, create it
                if (!fs.existsSync(fullBackupFilePath)) {
                    const headers = Object.keys(documents[0]);
                    fs.writeFileSync(fullBackupFilePath, `${headers.join(',')}\n`);
                }

                // Append the new data to the backup file in CSV format
                appendDataToCSVBackup(fullBackupFilePath, documents)
                console.log(`Backup for ${collectionName} completed successfully.`);
            } else {
                console.log(`No new data found for ${collectionName}.`);
            }
        }
        console.log(`Backup completed successfully. Data saved to ${backupDirectory}`);
    } catch (error) {
        console.error("Export failed: ", error);
    } finally {
        console.log("Connection closed.")
        client.close()
    }
}

// Run the export
exportData();