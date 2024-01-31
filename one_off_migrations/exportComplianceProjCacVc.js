const { MongoClient, ObjectId } = require('mongodb');
const csv = require('fast-csv');
const fs = require('fs');
const path = require('path');
const process = require('process');
const JSZip = require('jszip');
const axios = require('axios');

// MongoDB connection URI
// Dev: "mongodb://user:pw@localhost:5555/epic"
// Local: "mongodb://localhost/epic"
const URI = "mongodb://localhost/epic"; //Local
const API_PATH = "https://eagle-prod.apps.silver.devops.gov.bc.ca/api"; // Used to download assets
const AUTH_TOKEN = ""; // Auth token for api access
const DATABASE_NAME = "epic";
const COMPLIANCE = "Inspection";
const VALUED_COMPONENTS = "Vc";
const PROJECT_CAC = "CACUser";
const ComplianceFieldOrder = ["project", "project_name", "_id", "_schemaName", "name", "label", "case", "email", "startDate", "endDate", "elements", "customProjectName", "inspectionId", "_createdDate", "_updatedDate", "_addedBy", "_updatedBy", "_deletedBy", "read", "write", "delete", "__v"];
const ProjectCacFieldOrder = ["project", "project_name", "_id", "_schemaName", "name", "email", "liveNear", "liveNearInput", "memberOf", "memberOfInput", "knowledgeOf", "knowledgeOfInput", "additionalNotes", "read", "write", "__v"];
const VcFieldOrder = ["project", "project_name", "_id", "_schemaName", "type", "title", "description", "name", "code", "stage", "pillar", "parent", "updatedBy", "addedBy", "read", "write", "delete", "__v"];
const collectionConfig = [
    { collectionName: COMPLIANCE, fieldOrder: ComplianceFieldOrder, lastDocumentIdFile: `lastDocumentId_${COMPLIANCE}.txt`, backupFileName: `backup_${COMPLIANCE}.csv` },
    { collectionName: VALUED_COMPONENTS, fieldOrder: VcFieldOrder, lastDocumentIdFile: `lastDocumentId_${VALUED_COMPONENTS}.txt`, backupFileName: `backup_${VALUED_COMPONENTS}.csv` },
    { collectionName: PROJECT_CAC, fieldOrder: ProjectCacFieldOrder, lastDocumentIdFile: `lastDocumentId_${PROJECT_CAC}.txt`, backupFileName: `backup_${PROJECT_CAC}.csv` },
]

/**
 * Helper to get formatted time.
 */
function getFormattedTime(date) {
    let y = date.getFullYear();
    let m = date.getMonth() + 1;
    let d = date.getDate();
    let h = date.getHours();
    let mi = date.getMinutes();
    let s = date.getSeconds();
    return y + '-' + m + '-' + d + '-' + h + '-' + mi + '-' + s;
}

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
    if (!fs.existsSync(path.join(backupDirectory, "Inspections"))) {
        fs.mkdirSync(path.join(backupDirectory, "Inspections"));
    }
    return backupDirectory;
}

/**
 * Download Inspection Items
 * 1. Create zip file with Inspection meta data
 * 2. For each element within the inspection, create element folder
 * 3. For each element item in the element, request the asset via API add to folder
 * 4. Save zip
 * */
async function downloadInspection(db, inspectionDoc, backupDirectory) {
    // 1. Create zip
    const projectInfo = await getOneDoc(db, "Project", inspectionDoc.project);
    const projectName = projectInfo[`${projectInfo.currentLegislationYear}`].name;
    const zip = new JSZip();
    zip.file(
        `inspection.txt`,
        `
        Name: ${inspectionDoc.name}\n
        Inspection Number: ${inspectionDoc.case}\n
        Inspector Email: ${inspectionDoc.email}\n
        Start Date: ${inspectionDoc.startDate}\n
        End Date: ${inspectionDoc.endDate}\n
        Project: ${projectName}\n
        `
    );
    // 2. For each element create folder with element meta data
    for (let i = 0; i < inspectionDoc.elements.length; i++) {
        const elementDoc = await getOneDoc(db, "InspectionElement", inspectionDoc.elements[i].toString());
        const elementFolder = zip.folder(elementDoc.title);
        elementFolder.file(
            `element-${elementDoc.title}.txt`,
            `
            Title: ${elementDoc.title}\n
            Description: ${elementDoc.description}\n
            Requirement: ${elementDoc.requirement}\n
            Timestamp: ${elementDoc.timestamp}\n
            `
        );
        // 3. For each item request item download and write to folder
        for (let j = 0; j < elementDoc.items.length; j++) {
            const itemDoc = await getOneDoc(db, "InspectionItem", elementDoc.items[i]);
            await downloadItemAsset(inspectionDoc, elementDoc, itemDoc, elementFolder);
        }
    }
    // 4. Save zip
    try {
        zip
            .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
            .pipe(fs.createWriteStream(path.join(backupDirectory, `${projectName}_Inspection_${inspectionDoc.name}.zip`)))
            .on('finish', function () {
                console.log(`Inspection zip ${projectName}_Inspection_${inspectionDoc.name}.zip written.`);
            });
    }
    catch (error) {
        console.log("Failed to save Inspection zip.", error);
    }
}

/**
 * Download Asset and write to element folder.
 */
async function downloadItemAsset(inspectionDoc, elementDoc, itemDoc, elementFolder) {
    const itemDate = getFormattedTime(new Date(itemDoc.timestamp));
    const filename = `${inspectionDoc.name}_${itemDate}.${itemDoc.internalExt}`;
    const queryString = `inspection/${inspectionDoc._id}/${elementDoc._id}/${itemDoc._id}?filename=${filename}`;
    try {
        const response = await axios.get(API_PATH + '/' + queryString, {
            responseType: 'arraybuffer',
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`
            }
        });
        if (response.status === 200) {
            // Write file and metadata to elementFolder
            elementFolder.file(
                `${filename}_caption.txt`,
                `${itemDoc.caption}`
            );
            elementFolder.file(filename, response.data, { binary: true });
        }
    } catch (error) {
        console.log("Failed to get assset. Error: ", error);
    }
}

/**
 * Query db for one doc
 */
async function getOneDoc(db, schemaName, documentId) {
    const query = { _schemaName: schemaName, _id: ObjectId(documentId) };
    return new Promise(function (resolve, reject) {
        db.collection(DATABASE_NAME).findOne(query)
            .then(async function (data) {
                resolve(data);
            });
    });
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
function appendDataToCSVBackup(fieldOrder, fullBackupFilePath, documents, projectNames) {
    const csvStream = csv.format({ headers: false });
    const writableStream = fs.createWriteStream(fullBackupFilePath, { flags: 'a' });
    documents.forEach((document, index) => {
        // Order fields and add project_name
        const values = fieldOrder.map(field => (field === 'project_name' ? projectNames[index] : document[field] || ''));
        csvStream.write(values);
    });
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
        for (const { collectionName, fieldOrder, lastDocumentIdFile, backupFileName } of collectionConfig) {

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
                    fs.writeFileSync(fullBackupFilePath, `${fieldOrder.join(',')}\n`);
                }

                // Get project names to add to csv
                const projectNames = [];
                for (const doc of documents) {
                    const projectInfo = await getOneDoc(db, "Project", doc.project);
                    projectNames.push(projectInfo[`${projectInfo.currentLegislationYear}`].name);
                }

                // Append the new data to the backup file in CSV format
                appendDataToCSVBackup(fieldOrder, fullBackupFilePath, documents, projectNames);

                // For each inspection, download
                if (collectionName == COMPLIANCE) {
                    documents.forEach(async (doc, _ind) => {
                        await downloadInspection(db, doc, path.join(backupDirectory, "Inspections"));
                    });

                }
                console.log(`Backup for ${collectionName} completed successfully.`);
            } else {
                console.log(`No new data found for ${collectionName}.`);
            }
        }
        console.log(`Backup completed successfully. Data saved to ${backupDirectory}`);
    } catch (error) {
        console.log(`Export failed. Rerun with argument --backUpDir=${backupDirectory} to continue this export.`);
        console.error("Error: ", error);
    } finally {
        console.log("Connection closed.");
        client.close();
    }
}

// Run the export
exportData();