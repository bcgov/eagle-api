'use strict';

/**
 * Change Stream listener — syncs MongoDB epic collection to Typesense in near real-time.
 *
 * Watches the MongoDB "epic" collection for insert/update/replace/delete events
 * and mirrors them to Typesense. Only public documents (read: ['public']) are synced.
 *
 * Resume tokens are stored in-memory. On restart, the listener starts from the
 * current oplog position (missing at most a few seconds of changes). The nightly
 * full re-index CronJob fills any gaps.
 *
 * MongoDB must be running as a replica set (even single-member) for Change Streams.
 * See helm/eagle-api/templates/mongodb-deployment.yaml — --replSet rs0 is set there.
 *
 * Environment variables:
 *   MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_DATABASE, MONGODB_HOST,
 *   MONGODB_PORT, MONGODB_AUTHSOURCE,
 *   TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_API_KEY
 */

const { MongoClient } = require('mongodb');
const { getClient }   = require('./typesenseClient');
const { transformDoc, buildListLookup } = require('./transform');
const { SCHEMAS }     = require('./collections');
const { buildMongoUri } = require('./config');

const INDEXED_SCHEMAS = new Set(Object.keys(SCHEMAS));

function isPublic(doc) {
  return Array.isArray(doc.read) && doc.read.includes('public');
}

function isDeleted(doc) {
  return doc.isDeleted === true;
}

/**
 * Resolve the active Typesense collection name for a given schema.
 * If an alias exists (set by full-sync), use it; otherwise create the base collection.
 */
async function resolveCollection(typesense, schemaName) {
  const aliasName = SCHEMAS[schemaName].name;
  try {
    const alias = await typesense.aliases(aliasName).retrieve();
    return alias.collection_name;
  } catch {
    // No alias yet — ensure the base collection exists and return its name
    try {
      await typesense.collections(aliasName).retrieve();
    } catch {
      await typesense.collections().create(SCHEMAS[schemaName]);
      console.log(`Created initial collection: ${aliasName}`);
    }
    return aliasName;
  }
}

async function upsertDoc(typesense, schemaName, fullDoc, listLookup) {
  if (!isPublic(fullDoc) || isDeleted(fullDoc)) {
    // Doc is no longer public — remove from Typesense if it was there
    await deleteDoc(typesense, schemaName, fullDoc._id.toString());
    return;
  }

  const transformed = transformDoc(schemaName, fullDoc, listLookup);
  if (!transformed) return;

  const collectionName = await resolveCollection(typesense, schemaName);
  try {
    await typesense.collections(collectionName).documents().upsert(transformed);
  } catch (err) {
    console.error(`Upsert failed for ${schemaName} ${fullDoc._id}:`, err.message);
  }
}

async function deleteDoc(typesense, schemaName, id) {
  const collectionName = await resolveCollection(typesense, schemaName);
  try {
    await typesense.collections(collectionName).documents(id).delete();
    console.log(`Deleted ${schemaName} ${id} from Typesense`);
  } catch (err) {
    if (!err.message?.includes('404') && !err.message?.includes('Not Found')) {
      console.warn(`Delete failed for ${schemaName} ${id}:`, err.message);
    }
  }
}

async function processChange(typesense, mongoDB, event, listLookupRef) {
  const { operationType, fullDocument, documentKey, fullDocumentBeforeChange } = event;
  const docId = documentKey?._id?.toString();

  switch (operationType) {

    case 'insert':
    case 'replace': {
      const schemaName = fullDocument?._schemaName;
      if (!schemaName) return;
      // If a List or Organization doc changes, rebuild lookup so future transforms use fresh labels
      if (schemaName === 'List' || schemaName === 'Organization') {
        listLookupRef.map = await buildListLookup(mongoDB);
        console.log(`List lookup refreshed: ${listLookupRef.map.size} entries`);
        return;
      }
      if (!INDEXED_SCHEMAS.has(schemaName)) return;
      await upsertDoc(typesense, schemaName, fullDocument, listLookupRef.map);
      break;
    }

    case 'update': {
      // fullDocument is available when the watch pipeline uses fullDocument: 'updateLookup'
      const schemaName = fullDocument?._schemaName;
      if (!schemaName) return;
      if (schemaName === 'List' || schemaName === 'Organization') {
        listLookupRef.map = await buildListLookup(mongoDB);
        console.log(`List lookup refreshed: ${listLookupRef.map.size} entries`);
        return;
      }
      if (!INDEXED_SCHEMAS.has(schemaName)) return;
      await upsertDoc(typesense, schemaName, fullDocument, listLookupRef.map);
      break;
    }

    case 'delete': {
      // We don't know the schemaName after deletion — try all indexed schemas
      if (!docId) return;
      for (const schemaName of INDEXED_SCHEMAS) {
        await deleteDoc(typesense, schemaName, docId);
      }
      break;
    }

    default:
      break;
  }
}

async function startWatcher(typesense, mongoDB, listLookupRef) {
  const collection = mongoDB.collection('epic');

  // Expand the pipeline to also watch List schema changes (to refresh lookup)
  const pipeline = [
    {
      $match: {
        $or: [
          { 'fullDocument._schemaName': { $in: [...Array.from(INDEXED_SCHEMAS), 'List', 'Organization'] } },
          { operationType: 'delete' },
        ],
      },
    },
  ];

  const options = {
    fullDocument: 'updateLookup',    // Include full document on updates
    fullDocumentBeforeChange: 'off',
  };

  const changeStream = collection.watch(pipeline, options);

  console.log('Change Stream listener started. Watching epic collection...');

  changeStream.on('change', async (event) => {
    try {
      await processChange(typesense, mongoDB, event, listLookupRef);
    } catch (err) {
      console.error('Unhandled error processing change:', err);
    }
  });

  changeStream.on('error', (err) => {
    console.error('Change Stream error:', err.message);
    // The stream will be invalidated; the outer reconnect loop will restart
  });

  // Return a promise that resolves when the stream closes
  return new Promise((resolve) => {
    changeStream.on('close', resolve);
    changeStream.on('end', resolve);
  });
}

async function main() {
  const mongoUri  = buildMongoUri();
  const typesense = getClient();

  // Reconnect loop — restarts the Change Stream on connection loss
  while (true) {
    let mongo;
    try {
      mongo = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS:          45000,
      });
      await mongo.connect();
      const db = mongo.db(process.env.MONGODB_DATABASE || 'epic');
      console.log('Connected to MongoDB. Starting Change Stream...');

      const listLookupRef = { map: await buildListLookup(db) };
      console.log(`List lookup loaded: ${listLookupRef.map.size} entries`);

      await startWatcher(typesense, db, listLookupRef);

      console.warn('Change Stream closed. Restarting in 5s...');
    } catch (err) {
      console.error('Change Stream listener error:', err.message);
    } finally {
      if (mongo) {
        await mongo.close().catch(() => {});
      }
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('Reconnecting...');
  }
}

main().catch(err => {
  console.error('Fatal error in Change Stream listener:', err);
  process.exit(1);
});
