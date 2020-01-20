'use strict';

const mongoose = require('mongoose');

const dbm;
const type;
const seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

// This migration fixes bad data where some contacts are linked to a non-existent organization.
// The migration recreates the missing organization and links it to any contacts who 
// were using the missing organization.
exports.up = function(db) {
  let mClient;
  const updatePromises = [];

  return db.connection.connect(db.connectionString, { native_parser: true})
    .then(async (mClientInst) => {
      mClient = mClientInst;

      const collection = mClient.collection('epic');

      // Create a new organization - details pulled from DB backup.
      const organization = {
        _schemaName: 'Organization',
        description: '',
        name: 'Blueberry River First Nations',
        code: 'blueberry-river-first-nations',
        updatedBy: mongoose.Types.ObjectId('58850f2faaecd9001b8083b6'),
        addedBy: mongoose.Types.ObjectId('58850f2faaecd9001b8083b6'),
        dateUpdated: new Date(),
        dateAdded: new Date(),
        country: 'Canada',
        postal: 'V0C 2R0',
        province: 'British Columbia',
        city: 'Buick',
        address2: '',
        address1: 'PO Box 3009',
        companyType: 'Indigenous Group',
        parentCompany: '',
        companyLegal: '',
        company: 'Blueberry River First Nations',
        __v: 0,
      };

      const result = await collection.insert(organization);
      const orgId = result.ops[0]._id;

      const contacts = await collection.aggregate([
        { $match: { _schemaName: 'User', orgName: 'Blueberry River First Nations' } }
      ])
      .toArray();

      contacts.forEach(contact => {
        updatePromises.push(
          collection.update(
            {
              _id: contact._id
            },
            {
              $set: {
                org: mongoose.Types.ObjectId(orgId),
              }
            }
          )
        );
      });

      await Promise.all(updatePromises);
      
      mClient.close()
    })
    .catch((e) => {
      console.log('e:', e);
      mClient.close();
    });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
