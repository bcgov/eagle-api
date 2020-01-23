// Retrieve
var MongoClient = require("mongodb").MongoClient;
var fs = require("fs");
var ObjectId = require("mongodb").ObjectID;

// Connect to the db
// Dev
// MongoClient.connect("mongodb://x:x@localhost:5555/epic", async function(err, client) {
// Test
// MongoClient.connect("mongodb://x:x@localhost:5555/epic", async function (err, client) {
// Local
MongoClient.connect("mongodb://localhost/epic", async function(err, client) {
  if (!err) {
    console.log("We are connected");
    const db = client.db("epic");

    // Get current organizations in database
    var orgsData = await getOrgs(db);
    console.log("orgs data:", orgsData.length);

    // Get new organizations we want to import from JSON
    let newOrgs = require(process.cwd() + "/newOrgs");
    console.log("new orgs:", newOrgs.length);

    // Get current contacts in database
    let contactsData = await getContacts(db);
    console.log("contacts data:", contactsData.length);

    // Get new contacts we want to import from JSON
    let newContacts = require(process.cwd() + "/newContacts");
    console.log("new contacts:", newContacts.length);

    let newGroups = require(process.cwd() + "/newGroups");
    console.log("new groups:", newGroups.length);

    // Importing in organizations

    console.log("************* Processing Organizations *************");

    for (let z = 0; z < newOrgs.length; z++) {
      // log file to keep track of inserted items
      var filedata = fs.readFileSync("doneOrgs.json", "utf8");

      obj = JSON.parse(filedata); //now it's an object

      var found = filedata.includes(newOrgs[z].name);

      if (found) {
        // console.log("Already found, skipping", newOrgs[z].name);
      } else {
        // console.log("Inserting", newOrgs[z].name);
        insertOrg(db, newOrgs[z]);
        obj.push({ id: "" + newOrgs[z]._id }, { name: "" + newOrgs[z].name });
        json = JSON.stringify(obj); //convert it back to json
        fs.writeFileSync("doneOrgs.json", json, "utf8"); // write it back
      }
    }

    var all_orgs = await getOrgs(db);
    console.log(
      "\n\n\n********* Processed Organizations. Total Orgs is now ",
      all_orgs.length
    );

    // Importing in contacts

    console.log("\n\n\n************* Processing Contacts *************");

    for (let z = 0; z < newContacts.length; z++) {
      // log file to keep track of inserted items
      var logContacts = fs.readFileSync("doneContacts.json", "utf8");

      obj = JSON.parse(logContacts); //now it an object

      var found = logContacts.includes(newContacts[z].displayName);

      // Look up the organization document that matches the same orgName field for the Contact
      orgLookUp = await findOrg(db, newContacts[z].orgName);

      // Update Contact to link to organization's ObjectId
      try {
        orgID = orgLookUp[0]._id;
        newContacts[z].org = orgID;
      } catch (e) {
        console.log("Error", e);
        orgID = null;
      }

      newContacts[z].org = orgID;

      // insert Contact to DB
      if (found) {
        // console.log("Already found, skipping", newContacts[z].displayName);
      } else {
        // console.log("Inserting", newContacts[z].displayName);
        insertContact(db, newContacts[z]);
        obj.push(
          { id: "" + newContacts[z]._id },
          { displayName: "" + newContacts[z].displayName }
        );
        json = JSON.stringify(obj); //convert it back to json
        fs.writeFileSync("doneContacts.json", json, "utf8"); // write it back
      }
    }

    var all_contacts = await getContacts(db);
    console.log(
      "\n\n\n********* Processed Contacts. Total Contacts is now ",
      all_contacts.length
    );

    // Importing Project Groups:

    console.log("\n\n\n********* Processing Project Groups ");

    for (let z = 0; z < newGroups.length; z++) {
      // log file to keep track of inserted items
      var logGroups = fs.readFileSync("doneGroups.json", "utf8");

      obj = JSON.parse(logGroups); //now it an object

      // consider group added already if the log file contains the project name
      var found = logGroups.includes(newGroups[z].name);

      if (found) {
        // console.log("Already found, skipping", newGroups[z].name);
      } else {
        // console.log(
        //   "Inserting ",
        //   newGroups[z]["members"].length,
        //   " members into ",
        //   newGroups[z].name
        // );

        membersList = newGroups[z]["members"];

        // Look up members' ObjectID by name and store the contacts by id
        for (let i = 0; i < membersList.length; i++) {
          // console.log("Linking member", membersList[i])
          try {
            // try to look up contact by displayName
            contactID = await findContact(db, membersList[i]);
            newGroups[z]["members"][i] = contactID[0]._id;
          } catch (e) {
            // use first and last name instead of displayName for contact object in DB for search
            contactID = await findContact(
              db,
              null,
              newGroups[z]["members"][i].split(" ")[0],
              newGroups[z]["members"][i].split(" ")[1]
            );
            newGroups[z]["members"][i] = contactID[0]._id;
          }
        }
        // Store project field as ObjectId
        newGroups[z].project = ObjectId(newGroups[z].project);
        insertGroup(db, newGroups[z]);
        obj.push(
          { id: "" + newGroups[z]._id },
          { name: "" + newGroups[z].name }
        );
        json = JSON.stringify(obj); //convert it back to json
        fs.writeFileSync("doneGroups.json", json, "utf8"); // write it back
      }
    }
    console.log("ALL DONE");
    client.close();
  }
});

async function getOrgs(db) {
  return new Promise(function(resolve, reject) {
    db.collection("epic")
      .find({ _schemaName: "Organization" })
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}

async function getContacts(db) {
  return new Promise(function(resolve, reject) {
    db.collection("epic")
      .find({ _schemaName: "User" })
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}

async function findOrg(db, org) {
  return new Promise(function(resolve, reject) {
    db.collection("epic")
      .find({ _schemaName: "Organization", name: org })
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}

async function insertOrg(db, org) {
  return new Promise(function(resolve, reject) {
    db.collection("epic").insert(org);
  });
}

async function insertContact(db, contact) {
  return new Promise(function(resolve, reject) {
    db.collection("epic").insert(contact);
  });
}

async function insertGroup(db, group) {
  return new Promise(function(resolve, reject) {
    db.collection("epic").insert(group);
  });
}

async function findContact(db, name, first, last) {
  if (first) {
    return new Promise(function(resolve, reject) {
      db.collection("epic")
        .find({ _schemaName: "User", firstName: first, lastName: last })
        .toArray()
        .then(async function(data) {
          resolve(data);
        });
    });
  }
  return new Promise(function(resolve, reject) {
    db.collection("epic")
      .find({ _schemaName: "User", displayName: name })
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}
