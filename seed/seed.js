//TODO: revise for EPIC
'use strict';

//
// Example: node seed.js MONGO_USER MONGO_PASSWORD mongodb eagle-prod
//

var Promise         = require('es6-promise').Promise;
var _               = require('lodash');
var request         = require('request');
var fs              = require('fs');
var _applications   = [];
var _commentPeriods = [];
var _organizations  = [];
var _decisions      = [];
var _comments       = [];
var username        = '';
var password        = '';
var protocol        = 'http';
var host            = 'localhost';
var port            = '3000'
var uri             = '';

var args = process.argv.slice(2);
if (args.length !== 5) {
  console.log('');
  console.log('Please specify proper parameters: <username> <password> <protocol> <host> <port>');
  console.log('');
  console.log('eg: node seed.js admin admin http localhost 3000');
  return;
} else {
  username    = args[0];
  password    = args[1];
  protocol    = args[2];
  host        = args[3];
  port        = args[4];
  uri         = protocol + '://' + host + ':' + port + '/'; 
  console.log('Using connection:', uri);
}
// return;
// JWT Login
var jwt_login = null;
var login = function (username, password) {
  return new Promise (function (resolve, reject) {
    var body = JSON.stringify({
        username: username,
        password: password
      });
    request.post({
        url: uri + 'api/login/token',
        headers: {
          'Content-Type': 'application/json'
        },
        body: body
      }, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          // console.log("err:", err, res);
          reject(null);
        } else {
          var data = JSON.parse(body);
          // console.log("jwt:", data);
          jwt_login = data.accessToken;
          resolve(data.accessToken);
        }
    });
  });
};

var doWork = function (e, route) {
  return new Promise(function (resolve, reject) {
      // console.log("-----------------------");
      // console.log("route:", route);
      // console.log("e:", e);
      var postBody = JSON.stringify(e);

      // Bind the objectID's
      if (route === 'api/document' || route === 'api/commentperiod') {
        // console.log('app:', _applications);
        // console.log('e._application:', e._application);
        // console.log('e._decision:', e._decision);
        // console.log('e._comment:', e._comment);
        if (e._application) {
          var application = _.find(_applications, {code: e._application});
          e._application = application._id;
        } else if (e._decision) {
          var decision = _.find(_decisions, {code: e._decision});
          e._decision = decision._id;
        }

        if (route === 'api/document') {
          if (e._comment) {
            var comment = _.find(_comments, {code: e._comment});
            e._comment = comment._id;
          }
        }
      }
      if (route === 'api/public/comment') {
        // console.log('cmt:', _commentPeriods);
        var commentPeriod = _.find(_commentPeriods, {code: e.commentPeriod});
        e._commentPeriod = commentPeriod._id;
      }
      if (route === 'api/application') {
        // console.log('org:1', e.proponent);
        // console.log('org:2', _.find(_organizations, { name: e.proponent}));
        // FOR NOW, USING CLIENT STRING INSTEAD OF REF TO ORGANIZATION
        // var f = _.find(_organizations, { name: e.proponent});
        // e._proponent = f._id;
        //e.client = e.client;
      }
      if (route === 'api/decision') {
        var f = _.find(_applications, { code: e._application});
        // e._decision = f._id;
        e._application = f._id;
      }
      postBody = JSON.stringify(e);
      // end bind objectID's

      if (route === 'api/document') {
        var formData = {
          upfile: fs.createReadStream(e.internalURL),
          displayName: e.displayName
        };
        if (e._application) {
          formData._application = e._application;
        }
        if (e._decision) {
          formData._decision = e._decision;
        }
        if (e._comment) {
          // console.log("form:", formData);
          formData._comment = e._comment;
        }
        request.post({ url: uri + route,
                      headers: {
                          'Content-Type': 'application/json',
                          'Authorization': 'Bearer ' + jwt_login
                      },
                      formData: formData
                    },
          function optionalCallback(err, httpResponse, body) {
            var data = JSON.parse(body);
              if (err) {
                console.error('upload failed:', err);
                reject(null);
              } else {
                // Update it to be public
                request.put({
                    url: uri + route + '/' + data._id + '/publish',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': 'Bearer ' + jwt_login
                    },
                    body: postBody
                }, function (err2, res2, body2) {
                  if (err2 || res2.statusCode !== 200) {
                    console.log("err2:", err2);
                    reject(null);
                  } else {
                    resolve("Updated:", body2._id);
                  }
                });

              }
          }
        );
      } else {
        request.post({
            url: uri + route,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + jwt_login
            },
            body: postBody
          }, function (err, res, body) {
            if (err || res.statusCode !== 200) {
              // console.log("err:", err, res);
              reject(null);
            } else {
              var data = JSON.parse(body);
              // Save the various objects for later lookup
              if (route === 'api/application') {
                  _applications.push(data);
              }
              if (route === 'api/commentperiod') {
                _commentPeriods.push(data);
              }
              if (route === 'api/public/comment') {
                _comments.push(data);
              }
              if (route === 'api/organization') {
                  _organizations.push(data);
              }
              if (route === 'api/decision') {
                _decisions.push(data);
              }

              if (route === 'api/public/comment') {
                // Swap to the authenticated access route.
                route = 'api/comment';
              }
              // Update it to be public - assume everything public
              // unless it has the magic flag.
              if (e.seedDontPublish) {
                resolve();
              } else {
                request.put({
                  url: uri + route + '/' + data._id + '/publish',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + jwt_login
                  },
                  body: postBody
                  }, function (err3, res2, body2) {
                    if (err3 || res2.statusCode !== 200) {
                    console.log("err3:", err3);
                    reject(null);
                  } else {
                    resolve("Updated:", body2._id);
                  }
                });
              }
            }
        });
      }
  });
};

var insertAll = function (route, entries) {
  return new Promise(function (resolve, reject) {
    console.log("route:", route);

    Promise.resolve ()
    .then (function () {
      return entries.reduce (function (current, item) {
        return current.then (function () {
          return doWork(item, route);
        });
      }, Promise.resolve());
    }).then(resolve, reject);
  });
};

console.log("Logging in and getting JWT:");
login(username, password)
.then(function () {
  var orglist = require('./orglist.json');
  return insertAll('api/organization', orglist);
})
.then(function () {
  var applist = require('./applist.json');
  return insertAll('api/application', applist);
})
.then(function () {
  var cplist = require('./commentperiodlist.json');
  return insertAll('api/commentperiod', cplist);
})
.then(function () {
  var dlist = require('./decisionlist.json');
  return insertAll('api/decision', dlist);
})
.then(function () {
  var clist = require('./commentlist.json');
  return insertAll('api/public/comment', clist);
})
.then(function () {
  var orglist = require('./doclist.json');
  return insertAll('api/document', orglist);
})
.catch(function (err) {
  console.log("ERR:", err);
});
