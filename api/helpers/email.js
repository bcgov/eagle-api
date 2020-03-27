'use strict';

const axios = require('axios');
const qs = require('qs');
const winston = require('winston');
const defaultLog = winston.loggers.get('default');

const _publicServiceEndpoint = process.env.API_HOSTNAME !== undefined ? ('https://' + process.env.API_HOSTNAME + '/') : 'http://localhost:4300/';
const _GETOK_endpoint = process.env.GETOK_ENDPOINT || 'https://sso-dev.pathfinder.gov.bc.ca/auth/realms/jbd6rnxw/protocol/openid-connect/token';
const _GETOK_CLIENTID = process.env._GETOK_CLIENTID || null;
const _GETOK_CLIENT_SECRET = process.env._GETOK_CLIENT_SECRET || null;
const _commonHostingEmailServiceEndpoint = process.env.CHES_ENDPOINT || 'https://ches-master-9f0fbe-dev.pathfinder.gov.bc.ca/';
const _CHES_emailMergeAPI = 'api/v1/emailMerge';

// Runtime output
if (_GETOK_CLIENTID === null) {
  defaultLog.error('*******************************************************************');
  defaultLog.error('_GETOK_CLIENTID NOT SET');
  defaultLog.error('*******************************************************************');
}
if (_GETOK_CLIENT_SECRET === null) {
  defaultLog.error('*******************************************************************');
  defaultLog.error('_GETOK_CLIENT_SECRET NOT SET');
  defaultLog.error('*******************************************************************');
}

exports.sendCACWelcomeEmail = async function (projectId, projectName, email) {
  // Set/Get the template
  let emailTemplate = {
    "bodyType": "text",
    "body": "Welcome to the {{ projectName }} Community Advisory Committe!\r\n\r\nIf at any time you want to unsubscribe, click the link below.\r\n\r\n{{ unsubcribeHost }}cac-unsubscribe;project={{ projectNameEncoded }};projectId={{ projectId }};email={{ email }}",
    "contexts": [
      {
        "to": [email],
        "context": {
          "projectName": projectName,
          "projectNameEncoded": encodeURIComponent(projectName),
          "projectId": projectId,
          "unsubcribeHost": _publicServiceEndpoint,
          "email": email
        }
      }
    ],
    "encoding": "utf-8",
    "from": "BC Gov <noreply@gov.bc.ca>",
    "priority": "normal",
    "subject": "Welcome to the {{ projectName }} Community Advisory Committee"
  };

  // Send the emails to the CHES (Common Hosted Email Service)
  try {
    const getOKRes = await axios.post(_GETOK_endpoint,
      qs.stringify({
        'client_id': _GETOK_CLIENTID,
        'client_secret': _GETOK_CLIENT_SECRET,
        'grant_type': 'client_credentials',
      }),
      {
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }
      }
    );
    if (getOKRes && getOKRes.data && getOKRes.data.access_token) {
      // Send the welcome email
      await axios.post(
        _commonHostingEmailServiceEndpoint + _CHES_emailMergeAPI,
        emailTemplate,
        {
          headers: {
            "Authorization": 'Bearer ' + getOKRes.data.access_token,
            "Content-Type": 'application/json'
          }
        }
      );
      defaultLog.info("Email Sent");
    } else {
      defaultLog.error("Couldn't get a proper token", getOKRes);
    }
  } catch (err) {
    defaultLog.error("Error:", err);
    // fall through, don't block execution on this.
  }

  return;
};
