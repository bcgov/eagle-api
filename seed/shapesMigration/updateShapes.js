//TODO: revise for EPIC
//
// Example: node updateShapes.js admin admin https eagle-dev.pathfinder.gov.bc.ca 443
//
var Promise         = require('es6-promise').Promise;
var _               = require('lodash');
var request         = require('request');
var querystring     = require('querystring');
var Utils           = require('../../api/helpers/utils');
var username        = '';
var password        = '';
var protocol        = 'http';
var host            = 'localhost';
var port            = '3000';
var uri             = '';
var client_id       = '';
var grant_type      = '';
var auth_endpoint   = 'http://localhost:3000/api/login/token';
var _accessToken    = '';

var args = process.argv.slice(2);
if (args.length !== 8) {
    console.log('');
    console.log('Please specify proper parameters: <username> <password> <protocol> <host> <port> <client_id> <grant_type> <auth_endpoint>');
    console.log('');
    console.log('eg: node updateShapes.js admin admin http localhost 3000 client_id grant_type auth_endpoint');
    process.exit(1);
    return;
} else {
    username        = args[0];
    password        = args[1];
    protocol        = args[2];
    host            = args[3];
    port            = args[4];
    client_id       = args[5];
    grant_type      = args[6];
    auth_endpoint   = args[7];
    uri = protocol + '://' + host + ':' + port + '/';
    console.log('Using connection:', uri);
}

// JWT Login
var jwt_login = null;
var login = function (username, password) {
    return new Promise(function (resolve, reject) {
        var body = querystring.stringify({
            grant_type: grant_type,
            client_id: client_id,
            username: username,
            password: password
        });
        var contentLength = body.length;
        request.post({
            url: auth_endpoint,
            headers: {
                'Content-Length': contentLength,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        }, function (err, res, body) {
            if (err || res.statusCode !== 200) {
                console.log("err:", err, res);
                reject(null);
            } else {
                var data = JSON.parse(body);
                jwt_login = data.access_token;
                resolve(data.access_token);
            }
        });
    });
};

var getAllApplications = function (route) {
    return new Promise(function (resolve, reject) {
        console.log("calling:", uri + route + '?fields=tantalisID');
        request({
            url: uri + route + '?fields=tantalisID', headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + jwt_login
            }
        }, function (err, res, body) {
            if (err) {
                console.log("ERR:", err);
                reject(err);
            } else if (res.statusCode !== 200) {
                console.log("res.statusCode:", res.statusCode);
                reject(res.statusCode + ' ' + body);
            } else {
                var obj = {};
                try {
                    obj = JSON.parse(body);
                    console.log("Applications to process:", obj.length);
                    resolve(obj);
                } catch (e) {
                    console.log("e:", e);
                }
            }
        });
    });
};

var getAndSaveFeatures = function (accessToken, item) {
    return new Promise(function (resolve) {
      Utils.getApplicationByDispositionID(accessToken, item.tantalisID)
      .then(function (obj) {
        // console.log("returning:", obj);
        // Store the features in the DB
        var allFeaturesForDisp = [];
        item.areaHectares = obj.areaHectares;

        var turf = require('@turf/turf');
        var helpers = require('@turf/helpers');
        var centroids = helpers.featureCollection([]);
        _.each(obj.parcels, function (f) {
            // Tags default public
            f.tags = [['sysadmin'], ['public']];
            // copy in all the app meta just to stay consistent.
            f.properties.RESPONSIBLE_BUSINESS_UNIT      = obj.RESPONSIBLE_BUSINESS_UNIT;
            f.properties.TENURE_PURPOSE                 = obj.TENURE_PURPOSE;
            f.properties.TENURE_SUBPURPOSE              = obj.TENURE_SUBPURPOSE;
            f.properties.TENURE_STATUS                  = obj.TENURE_STATUS;
            f.properties.TENURE_TYPE                    = obj.TENURE_TYPE;
            f.properties.TENURE_STAGE                   = obj.TENURE_STAGE;
            f.properties.TENURE_SUBTYPE                 = obj.TENURE_SUBTYPE;
            f.properties.TENURE_LOCATION                = obj.TENURE_LOCATION;
            f.properties.DISPOSITION_TRANSACTION_SID    = obj.DISPOSITION_TRANSACTION_SID;
            f.properties.CROWN_LANDS_FILE               = obj.CROWN_LANDS_FILE;

            allFeaturesForDisp.push(f);
            // Get the polygon and put it for later centroid calculation
            centroids.features.push(turf.centroid(f));
        });
        // Centroid of all the shapes.
        if (centroids.features.length > 0) {
            item.centroid = turf.centroid(centroids).geometry.coordinates;
        }
        item.client = "";
        for (let [idx, client] of Object.entries(obj.interestedParties)) {
            if (idx > 0) {
                item.client += ", ";
            }
            if (client.interestedPartyType == 'O') {
                item.client += client.legalName;
            } else {
                item.client += client.firstName + " " + client.lastName;
            }
        }

        Promise.resolve()
        .then(function () {
            return allFeaturesForDisp.reduce(function (previousItem, currentItem) {
                return previousItem.then(function () {
                    return doFeatureSave(currentItem, item._id);
                });
            }, Promise.resolve());
        }).then(function () {
            resolve(item);
        });
      });
    });
};

var doFeatureSave = function (item, appId) {
    return new Promise(function (resolve, reject) {
        item.applicationID = appId;
        request.post({
            url: uri + 'api/feature',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + jwt_login
            },
            body: JSON.stringify(item)
        }, function (err, res, body) {
            if (err || res.statusCode !== 200) {
                console.log("err:", err, res);
                reject(null);
            } else {
                var data = JSON.parse(body);
                resolve(data);
            }
        });
    });
};

var deleteAllApplicationFeatures = function (item) {
    return new Promise(function (resolve, reject) {
        request.delete({
            url: uri + 'api/feature?applicationID=' + item._id,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + jwt_login
            },
        }, function (err, res, body) {
            if (err || res.statusCode !== 200) {
                console.log("err:", err, res);
                reject(null);
            } else {
                var data = JSON.parse(body);
                resolve(data);
            }
        });
    });
};

var updateApplicationMeta = function (item) {
    return new Promise(function (resolve, reject) {
        var updatedAppObject = {};
        updatedAppObject.businessUnit     = item.RESPONSIBLE_BUSINESS_UNIT;
        updatedAppObject.purpose          = item.TENURE_PURPOSE;
        updatedAppObject.subpurpose       = item.TENURE_SUBPURPOSE;
        updatedAppObject.status           = item.TENURE_STATUS;
        updatedAppObject.type             = item.TENURE_TYPE;
        updatedAppObject.tenureStage      = item.TENURE_STAGE;
        updatedAppObject.subtype          = item.TENURE_SUBTYPE;
        updatedAppObject.location         = item.TENURE_LOCATION;
        updatedAppObject.legalDescription = item.TENURE_LEGAL_DESCRIPTION;
        updatedAppObject.centroid         = item.centroid;
        updatedAppObject.areaHectares     = item.areaHectares;
        updatedAppObject.client           = item.client;
        request.put({
            url: uri + 'api/application/' + item._id,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + jwt_login
            },
            body: JSON.stringify(updatedAppObject),
        }, function (err, res, body) {
            if (err || res.statusCode !== 200) {
                console.log("err:", err, res);
                reject(null);
            } else {
                var data = JSON.parse(body);
                resolve(data);
            }
        });
    });
};

console.log("Logging in and getting JWT.");
login(username, password)
.then(function () {
    // Get a token from webade for TTLS API calls (getAndSaveFeatures)
    return Utils.loginWebADE()
    .then(function (accessToken) {
        console.log("TTLS API Logged in:", accessToken);
        _accessToken = accessToken;
        return _accessToken;
    });
})
.then(function () {
    console.log("Getting applications");
    return getAllApplications('api/application');
})
.then(function (apps) {
    // Now iterate through each application, grabbing the tantalisID and populating the shapes in the feature collection.
    return new Promise(function (resolve, reject) {
        Promise.resolve()
            .then(function () {
                return apps.reduce(function (current, item) {
                    return current.then(function () {
                        console.log("-------------------------------------------------------");
                        console.log("Deleting existing features.");
                        // First delete all the application features.  We blindly overwrite.
                        return deleteAllApplicationFeatures(item)
                            .then(function () {
                                // Fetch and store the features in the feature collection for this
                                // application.
                                console.log("Fetching and storing features:", item._id);
                                return getAndSaveFeatures(_accessToken, item);
                            })
                            .then(function (app) {
                                if (app) {
                                    // Update the application meta.
                                    console.log("Updating application meta for DISP:", app.tantalisID);
                                    // change this to reference the item data coming from TTLSAPI
                                    return updateApplicationMeta(app);
                                } else {
                                    // No feature - don't update meta.
                                    console.log("No features found - not updating.");
                                    return Promise.resolve();
                                }
                            });
                    });
                }, Promise.resolve());
            }).then(resolve, reject);
    });
})
.catch(function (err) {
    console.log("ERR:", err);
    process.exit(1);
});