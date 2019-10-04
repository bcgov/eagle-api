const factory = require('factory-girl').factory;
const CommentPeriod = require('../../helpers/models/commentperiod');
const factory_helper = require('./factory_helper');
const moment = require('moment');
let faker = require('faker/locale/en');

const informationLabels = [
    ""
  , "Amendment #6 Application"
  , "Amendment Application"
  , "Amendment Application for Kootenay West Mine EA Certificate"
  , "Application for Amendment #3"
  , "Application for an Environmental Assessment"
  , "Application for an Environmental Assessment Certificate"
  , "Application to amend Environmental Assessment Certificate (EAC) #15-02"
  , "Certificate Amendment"
  , "Comment Period on the Application for an Environmental Assessment"
  , "Discussion Paper"
  , "Draft Exemption Assessment Report"
  , "Draft Provincial Referral Materials"
  , "Provincial Draft Assessment Report"
  , "Section 10 Order"
  , "Transmission Line Alignment Report"
  , "Valued Component Rationale Document"
  , "WesPac Midstream-Vancouver LLC's Application for an Environmental Assessment Certificate"
  , "air"
  , "draft AIR"
  , "draft Application Information Reqirements"
  , "draft Application Information Requirements"
  , "draft Valued Components Selection Document"
  , "test"
];

const phaseNames = [
    ""
  , "Decision"
  , "Determination"
  , "Evaluation"
  , "Intake"
  , "Post-Certification"
  , "Review"
  , "Scope"
];

const userCanExamples = [
    ''
  , '{"addComment":false,"listComments":false,"classifyComments":false,"vetComments":false,"delete":false,"write":false,"read":false}'
  , '{"addComment":true,"listComments":true,"classifyComments":false,"vetComments":false,"delete":false,"write":false,"read":true,"publish":false,"unPublish":false}'
  , '{"addComment":true,"listComments":true,"classifyComments":false,"vetComments":false,"delete":true,"write":true,"read":true}'
  , '{"addComment":true,"listComments":true,"classifyComments":false,"vetComments":false,"delete":true,"write":true,"read":true,"publish":true,"unPublish":true}'
  , '{"addComment":true,"listComments":true,"classifyComments":true,"vetComments":true,"delete":true,"write":true,"read":true}'
  , '{"addComment":true,"listComments":true,"classifyComments":true,"vetComments":true,"delete":true,"write":true,"read":true,"publish":true,"unPublish":true}'
  , '{"listComments":false,"read":false,"downloadComments":false,"addComment":false,"delete":false,"write":false,"unPublish":false,"vetComments":false,"classifyComments":false,"publish":false}'
  , '{"unPublish":false,"publish":false,"addComment":false,"listComments":false,"classifyComments":false,"vetComments":false,"delete":false,"write":false,"read":false}'
  , '{"listComments":true,"read":true,"downloadComments":true,"addComment":true,"delete":true,"write":true,"unPublish":false,"vetComments":true,"classifyComments":true,"publish":false}'
  , '{"listComments":true,"read":true,"downloadComments":false,"addComment":true,"delete":true,"write":true,"unPublish":true,"vetComments":true,"classifyComments":false,"publish":true}'
  , '{"listComments":true,"read":true,"downloadComments":false,"addComment":true,"delete":true,"write":true,"unPublish":true,"vetComments":true,"classifyComments":true,"publish":true}'
];

const vettingRoles = [
  []
  , ["project-team","project-system-admin"]
  , ["project-team"]
];

factory.define('commentPeriod', CommentPeriod, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  // order dependent chain backwards in time so that the dates make sense
  let dateUpdated = moment(faker.date.past(10, new Date()));
  let dateCompleted = dateUpdated.clone().subtract(faker.random.number(10), 'days'); // company or staff is doing work, 'active' is a state
  let dateCompletedEst = dateCompleted.clone().subtract(faker.random.number(5), 'days');
  let dateOpenHoused = dateCompletedEst.clone().subtract(faker.random.number(5), 'days');
  let dateStarted = dateOpenHoused.clone().subtract(faker.random.number(45), 'days');
  let dateStartedEst = dateStarted.clone().subtract(faker.random.number(5), 'days'); // 45 days is the max allowed
  let dateAdded = dateStartedEst.clone().subtract(faker.random.number(10), 'days');

  let attrs = {
      additionalText       : faker.lorem.paragraph()
    , ceaaAdditionalText   : faker.lorem.paragraph()
    , ceaaInformationLabel : faker.lorem.sentence()
    , ceaaRelatedDocuments : ""
    , classificationRoles  : "[" + ((faker.random.boolean() ? "project-proponent, " : "") + (faker.random.boolean() ? "project-team, " : "") + (faker.random.boolean() ? "project-system-admin" : "")).replace(/(,\s*$)/g, "") + "]"
    , classifiedPercent    : faker.random.number(100)
    , commenterRoles       : faker.random.arrayElement(["", "public"])
    , dateAdded            : dateAdded
    , dateCompleted        : dateCompleted
    , dateCompletedEst     : dateCompletedEst
    , dateStarted          : dateStarted
    , dateStartedEst       : dateStartedEst
    , dateUpdated          : dateUpdated
    , downloadRoles        : faker.random.arrayElement(["", "project-system-admin"])
    , informationLabel     : faker.random.arrayElement(informationLabels)
    , instructions         : faker.lorem.paragraph()
    , isClassified         : faker.random.boolean()
    , isPublished          : faker.random.boolean()
    , isResolved           : faker.random.boolean()
    , isVetted             : faker.random.arrayElement(["", "false"])
    , milestone            : require('mongoose').Types.ObjectId()
    , openHouses           : ((faker.random.boolean() ? [] : [{"description": chance.animal() + " Hall\n" + faker.address.streetAddress() + ", " + faker.random.arrayElement(factory_helper.getBcCities()) + "\n" + dateOpenHoused.toString('dddd, MMMM ,yyyy') + "\n8:00 - 9:30pm","eventDate":dateOpenHoused}]))
    , periodType           : faker.random.arrayElement(["", "Public"])
    , phase                : (faker.random.boolean() ? "" : require('mongoose').Types.ObjectId())
    , phaseName            : faker.random.arrayElement(phaseNames)
    , project              : require('mongoose').Types.ObjectId()
    , publishedPercent     : faker.random.arrayElement(["", "0"])
    , rangeOption          : faker.random.arrayElement(["", "30", "45", "custom"])
    , rangeType            : faker.random.arrayElement(["", "custom", "start", "end"])
    , relatedDocuments     : faker.random.arrayElement([[], [require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId()]])
    , resolvedPercent      : faker.random.arrayElement(["", "0"])
    , userCan              : faker.random.arrayElement(userCanExamples)
    , vettedPercent        : faker.random.number(100)
    , vettingRoles         : faker.random.arrayElement(vettingRoles)
    , commentIdCount       : faker.random.number(300)

    // Permissions
    , read                : 'sysadmin'
    , write               : 'sysadmin'
    , delete              : 'sysadmin'

  };

  return attrs;
});

exports.factory = factory;
