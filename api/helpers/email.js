'use strict';

const winston = require('winston');
const defaultLog = winston.loggers.get('default');

const _publicServiceEndpoint = process.env.API_HOSTNAME !== undefined ? ('https://' + process.env.API_HOSTNAME + '/') : 'http://localhost:4300/';
const _GETOK_endpoint = process.env.GETOK_ENDPOINT || 'https://dev.oidc.gov.bc.ca/auth/realms/jbd6rnxw/protocol/openid-connect/token';
const _GETOK_CLIENTID = process.env._GETOK_CLIENTID || null;
const _GETOK_CLIENT_SECRET = process.env._GETOK_CLIENT_SECRET || null;
const _commonHostingEmailServiceEndpoint = process.env.CHES_ENDPOINT || 'https://ches-master-9f0fbe-dev.pathfinder.gov.bc.ca/';
const _CHES_emailMergeAPI = 'api/v1/emailMerge';

// Configuration check function called after logger transports are registered
const checkConfig = function () {
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
};

exports.checkConfig = checkConfig;


exports.sendCACWelcomeEmail = async function (projectId, projectName, email) {
  // Set/Get the template
  let emailTemplate = {
    "bodyType": "text",
    "body": "Thank you for signing up to be a member of the Community Advisory Committee. You are now set up to receive emails from the Environmental Assessment Office regarding {{ projectName }} project.\r\n\r\nYou will receive updates and information straight to your inbox. We will keep you up to date on process milestones, when and where key documents are posted, information on public comment periods, and any other engagement opportunities.\r\n\r\nYou will be hearing from us soon regarding the next steps in the environmental assessment process and how you can provide your input on the potential effects of the project on the community.\r\n\r\nWe also recommend that you check out the project on our project information centre here: https://projects.eao.gov.bc.ca/.\r\n\r\nYou can learn more about the environmental assessment process in general and access guidance materials and policies here: https://www2.gov.bc.ca/gov/content/environment/natural-resource-stewardship/environmental-assessments/guidance-documents\r\n\r\nIf at any time you want to unsubscribe, click the link below.\r\n\r\n{{ unsubcribeHost }}cac-unsubscribe;project={{ projectNameEncoded }};projectId={{ projectId }};email={{ email }} \r\n\r\nWe look forward to engaging with you on this project.\r\n\r\nSincerely,\r\n\r\nThe project team at the Environmental Assessment Office\r\n\r\nThis is an automatically generated email, please do not reply.\r\n\r\n",
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
    "from": "BC Gov - Environmental Assessment Office <noreply@gov.bc.ca>",
    "priority": "normal",
    "subject": "Welcome to the {{ projectName }} Community Advisory Committee"
  };

  // Send the emails to the CHES (Common Hosted Email Service)
  try {
    const getOKRes = await fetch(_GETOK_endpoint, {
      method: 'POST',
      body: new URLSearchParams({
        'client_id': _GETOK_CLIENTID,
        'client_secret': _GETOK_CLIENT_SECRET,
        'grant_type': 'client_credentials',
      }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      }
    });

    if (getOKRes.ok) {
      const getOKData = await getOKRes.json();
      if (getOKData && getOKData.access_token) {
        // Send the welcome email
        const chesRes = await fetch(
          _commonHostingEmailServiceEndpoint + _CHES_emailMergeAPI,
          {
            method: 'POST',
            body: JSON.stringify(emailTemplate),
            headers: {
              "Authorization": 'Bearer ' + getOKData.access_token,
              "Content-Type": 'application/json'
            }
          }
        );
        if (!chesRes.ok) {
          throw new Error('CHES response status ' + chesRes.status);
        }
        defaultLog.info("Email Sent");
      } else {
        defaultLog.error("Couldn't get a proper token", getOKData);
      }
    } else {
      defaultLog.error("Couldn't get token, status " + getOKRes.status);
    }
  } catch (err) {
    defaultLog.error(`Error:: ${err.message}`);
    // fall through, don't block execution on this.
  }

  return;
};
