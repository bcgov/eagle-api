var mongoose = require('mongoose');
var _ = require('underscore');
var Mixed = mongoose.Schema.Types.Mixed;

// legislation specific data schema
var projectDataDefinition = {

  //Needed for default view
  CEAAInvolvement         : { type:'ObjectId', default: null },
  CELead                  : { type: String, default: '' },
  CELeadEmail             : { type: String, default: '' },
  CELeadPhone             : { type: String, default: '' },
  centroid                : [{ type: Mixed, default: 0.00}],
  description             : { type: String, default: '' },
  eacDecision             : { type:'ObjectId', default: null },
  location                : { type: String, default: '' },
  name                    : { type: String, trim: true },
  projectLeadId           : { type:'ObjectId', default: null },
  projectLead             : { type: String, default: '' },
  projectLeadEmail        : { type: String, default: '' },
  projectLeadPhone        : { type: String, default: '' },
  proponent               : { type:'ObjectId', default: null },
  region                  : { type: String, default: '' },
  responsibleEPDId        : { type:'ObjectId', default: null },
  responsibleEPD          : { type: String, default: '' },
  responsibleEPDEmail     : { type: String, default: '' },
  responsibleEPDPhone     : { type: String, default: '' },
  type                    : { type: String, default: '' },
  legislation             : { type: String, default: '' },
  legislationYear         : { type: Number },
  nameSearchTerms         : [{ type: String }],


  //Everything else
  addedBy                 : { type: String, default: '' },
  build                   : { type: String, default: '' },
  CEAALink                : { type: String, default: '' },
  code                    : { type: String, default: '' },
  commodity               : { type: String, default: '' },
  currentPhaseName        : { type: 'ObjectId', default: null },
  phaseHistory            : { type: Mixed, default: '' },
  dateAdded               : { type: String, default: '' },
  dateCommentsClosed      : { type: String, default: '' },
  dateCommentsOpen        : { type: String, default: '' },
  dateUpdated             : { type: Date, default: '' },
  decisionDate            : { type: Date, default: null },
  duration                : { type: String, default: '' },
  // TODO: directoryStructure
  eaoMember               : { type: String, default: '' },
  // epicProjectID           : { type: Number, default: 0 },
  fedElecDist             : { type: String, default: '' },
  // TODO: intake
  intake                  : { type: Mixed, default: ''},
  isTermsAgreed           : { type: Boolean, default: false },
  overallProgress         : { type: Number },
  primaryContact          : { type: String, default: '' },
  proMember               : { type: String, default: '' },
  provElecDist            : { type: String, default: '' },
  sector                  : { type: String, default: '' },
  shortName               : { type: String, default: '', index: true },
  status                  : { type: String, default: '' },
  substitution            : { type: Boolean, default: false },

  // TODO: New Stuff?
  eaStatusDate            : { type: Date, default: '' },
  eaStatus                : { type: String, default: '' },
  projectStatusDate       : { type: Date, default: '' },
  substantiallyDate       : { type: Date, default: '' },
  substantially           : { type: Boolean, default: false },
  disputeDate             : { type: Date, default: '' },
  dispute                 : { type: Boolean, default: false },
  activeDate              : { type: Date, default: '' },
  activeStatus            : { type: String, default: '' },

  // Project Review Data
  review180Start          : { type: Date, default: null },
  review45Start           : { type: Date, default: null },
  reviewSuspensions        : [{ type: Mixed, default: {} }],
  reviewExtensions         : [{ type: Mixed, default: {} }],

  /////////////////////
  // Contact references
  /////////////////////
  // Project Lead
  projLead                : { type: 'ObjectId', ref: 'User', default: null, index: true },

  // Executive Project Director
  execProjectDirector     : { type: 'ObjectId', ref: 'User', default: null, index: true },

  // Compliance & Enforcement Lead
  complianceLead          : { type: 'ObjectId', ref: 'User', default: null, index: true },
  //////////////////////
  groups                   : [{ type: 'ObjectId', ref: 'Group', default: null, index: true }]
};

// actual project schema
var projectDefinition = {
  currentLegislationYear: String,
  legislationYearList: [ Number ],
  legislation_1996: projectDataDefinition,
  legislation_2002: projectDataDefinition,
  legislation_2018: projectDataDefinition,
  // Permissions
  read                   : [{ type: String, trim: true, default: '["project-system-admin"]' }],
  write                  : [{ type: String, trim: true, default: '["project-system-admin"]' }],
  delete                 : [{ type: String, trim: true, default: '["project-system-admin"]' }],
  // PINs
  /////////////////////
  pins                    : [{ type: 'ObjectId', ref: 'Pin', index: true }],
  pinsRead                : [{ type: String, trim: true, default: '["project-system-admin"]' }],
  pinsHistory             : [{ type: Mixed, default: {} }],
  links                   : [{ type: Mixed }],
  // Featured Documents DocID list
  featuredDocuments       : [{ type: 'ObjectId', ref: 'Document', default: [], index: true }],

  // CAC
  projectCAC : { type: Boolean, default: false },
  cacMembers : [{ type: 'ObjectId', ref: 'CACUser' }],
  cacEmail   : { type: String, default: 'noreply@projects.eao.gov.bc.ca' },
  projectCACPublished : { type: Boolean, default: false }

};

var buildToNature = {};
buildToNature.new = 'New Construction';
buildToNature.modification = 'Modification of Existing';
buildToNature.dismantling = 'Dismantling or Abandonment';
buildToNature.unknown = 'Unknown nature value';

// define a new mongoose virtual called nature as a basic object
// with a name field, and getter and setter functions
var nature = {};
nature.name = 'nature';
nature.get = function () {
  if (!(this.build in buildToNature)) return buildToNature.unknown;
  return buildToNature[this.build];
};
nature.set = function (nature) {
  try {
    this.set('build', (_.invert(buildToNature))[nature]);
  } catch (error) {
    console.log('Failed to parse nature: "' + nature + '" with error: "' + error + '"');
    this.set('build', null);
  }
};

projectDefinition.virtuals__ = [nature];

module.exports = require('../models')('Project', projectDefinition, 'epic');