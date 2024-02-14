const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const fastCsv = require('fast-csv');
const moment = require('moment');
const path = require('path');

// Replace the connection string with your MongoDB URI
const mongoURI = 'mongodb://user@localhost:5555/epic';
const inputFilePath = 'dateCorrectionSpreadsheet_20240129.csv'; // Can be set to output file if partially completed.
const schemaName = 'Document';
const updateHeader = 'updated_date'; //bool

/**
 * Set datePosted to new date in PST at noon.
 */
async function updateDate(collection, docId, newDocDate){
    const updatedDatePosted = moment(newDocDate, 'YYYY/MM/DD', 'America/Vancouver').set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
    console.log(updatedDatePosted.toDate());
    await collection.updateOne(
        { _id: ObjectId(docId) },
        { $set: { datePosted: new Date(updatedDatePosted.toDate()) } }
      );
    return true;
}

/**
 * Query mongo for doc via internalOriginalName. 
 * Return bool on whether query was successful.
 */
async function queryMongoDB(collection, internalDocName, newDocDate) {
    let updated = false;
    try {
        const query = { _schemaName: schemaName, internalOriginalName: internalDocName };

        // query mongo
        const result = await collection.findOne(query);
        if(result){
            const docId = result._id;
            updated = await updateDate(collection, docId, newDocDate);
        }else{
            console.log("Doc not found.");
            console.log("Query", query);
            updated = false;
        }
        
    } catch (e) {
        console.log('error ', e);
    }
    return updated;
}


/**
 * Read in .csv with documents and query the db.for each doc.
 * Update documents datePosted to be the date at noon.
 * Output to .csv with each doc and whether updated = true;
 */
async function correctDates() {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const outputFilePath = `outputDateCorrection_${timestamp}.csv`;
    const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        console.log('Connected to MongoDB');

        // Specify the collection and the query
        const collection = client.db().collection('epic');

        // Parse csv and make db query and update line
        const processLine = async (collection, line) => {
            const docFileUrl = line['e_pic_file_name'];
            const newDocDate = line['date_posted'];
            const internalDocName = path.basename(docFileUrl);
            // Skip lines already updated
            if(line[updateHeader] && line[updateHeader] === 'true'){
                console.log("Already up-to-date.");
                return line;
            }
            // Make query
            const updated = await queryMongoDB(collection, internalDocName, newDocDate);
            // Update the line with the result
            line[updateHeader] = updated;
            return line;
        };
        // Read in csv, update line, write to output file.
        fs.createReadStream(inputFilePath)
            .pipe(fastCsv.parse({headers: true}))
            .pipe(fastCsv.format({headers: true}))
            .transform((line, _callback) => {
                setImmediate(async () => _callback(null, 
                    await processLine(collection, line)
                ));
            })
            .pipe(fs.createWriteStream(outputFilePath))
            .on('finish', async () =>{
                // Close the connection
                await client.close();
                console.log('Connection closed');
            })
    } catch (e) {
        console.log("Error: ", e);
    } 
}

// Call the function
correctDates();
