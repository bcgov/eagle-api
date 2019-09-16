const factory = require('factory-girl').factory;
const Project = require('../../helpers/models/project');
const faker = require('faker');

const ceaaInvolvements = [
    "Comp Study"
    , "Comp Study - Unconfirmed"
    , "Comprehensive Study"
    , "Comprehensive Study (Pre CEAA 2012)"
    , "Comprehensive Study - Confirmed"
    , "Comprehensive Study - Unconfirmed"
    , "Coordinated"
    , "Equivalent - NEB"
    , "None"
    , "Panel"
    , "Panel (CEAA 2012)"
    , "Screening"
    , "Screening - Confirmed"
    , "Substituted"
    , "Substituted (Provincial Lead)"
    , "To be determined"
    , "Yes"
    ];

const eacDecision = [
    ""
    , "Certificate Expired"
    , "Certificate Issued"
    , "Certificate Not Required"
    , "Certificate Refused"
    , "Further Assessment Required"
    , "In Progress"
    , "Not Designated Reviewable"
    , "Pre-EA Act Approval"
    , "Terminated"
    , "Withdrawn"
]


const projectNameSuffixes = [
    "Mine"
    , "Pit"
    , "Quarry"
];

const projectTypes = [
    "Energy-Electricity"
    , "Energy-Petroleum & Natural Gas"
    , "Industrial"
    , "Mines"
    , "Other"
    , "Tourist Destination Resorts"
    , "Transportation"
    , "Waste Disposal"
    , "Water Management"
];

const projectBuilds = [
    "dismantling"
    , "modification"
    , "new"
];

const currentPhaseNames = [
    "Decision"
    , "Determination"
    , "Intake"
    , "Post-Certification"
    , "Review"
    , "Scope"
];

const regions = [
    "Cariboo"
    , "Kootenay"
    , "Lower Mainland"
    , "Okanagan"
    , "Omineca"
    , "Peace"
    , "Skeena"
    , "Thompson-Nicola"
    , "Vancouver Island"
];

const federalElectoralDistricts = [
    "Delta"
    , "Kootenay-Columbia"
    , "Mission--Matsqui--Fraser Canyon"
    , "Skeena - Bulkley Valley"
];

const sectors = [
    "Airports"
    , "Coal Mines"
    , "Construction Stone and Industrial Mineral Quarries"
    , "Dams"
    , "Electric Transmission Lines"
    , "Energy Storage Facilities"
    , "Forest Products Industries"
    , "Golf Resorts"
    , "Groundwater Extraction"
    , "Hazardous Waste Facilities"
    , "Local Government Solid Waste Management Facilities"
    , "Marine Port Facilities"
    , "Mineral Mines"
    , "Natural Gas Processing Plants"
    , "Non-metallic Mineral Products Industries"
    , "Organic and Inorganic Chemical Industry"
    , "Other"
    , "Power Plants"
    , "Public Highways"
    , "Railways"
    , "Sand and Gravel Pits"
    , "Shoreline Modification"
    , "Ski Resorts"
    , "Transmission Pipelines"
    , "Water Diversion"
]

const statuses = [
    "Certified"
    , "In Progress"
    , "Initiated"
    , "Not Certified"
    , "Submitted"
]

const eaStatuses = [
    ""
    , "Requires EAC"
    , "Does not require EAC"
]

factory.define('project', Project, () => ({
      //Needed for default view
  CEAAInvolvement           : faker.random.arrayElement(ceaaInvolvements)
  , CELead                  : "Compliance & Enforcement Branch"
  , CELeadEmail             : "eao.compliance@gov.bc.ca"
  , CELeadPhone             : faker.phone.phoneNumber()
  , centroid                : 0.00
  , description             : faker.lorem.paragraph()
  , eacDecision             : faker.random.arrayElement(eacDecision)
  , location                : faker.random.number(200) + "km " + faker.random.arrayElement(["", "N", "S"]) + faker.random.arrayElement(["", "E", "W"]) + " of " + faker.address.city()
  , name                    : faker.company.companyName() + " " + faker.random.arrayElement(projectNameSuffixes)
  //, projectLeadId           : { type:'ObjectId', default: null }
  , projectLead             : faker.fake("{{name.firstName}} {{name.lastName}}")
  , projectLeadEmail        : faker.internet.email()
  , projectLeadPhone        : faker.phone.phoneNumber()
  //, proponent               : { type:'ObjectId', default: null }
  , region                  : faker.random.arrayElement(regions)
  //, responsibleEPDId        : { type:'ObjectId', default: null }
  , responsibleEPD          : faker.fake("{{name.firstName}} {{name.lastName}}")
  , responsibleEPDEmail     : faker.internet.email()
  , responsibleEPDPhone     : faker.phone.phoneNumber()
  , type                    : faker.random.arrayElement(projectTypes)
  , legislation             : ''


  //Everything else
  , addedBy                 : require('mongoose').Types.ObjectId()
  , build                   : faker.random.arrayElement(projectBuilds)
  , CEAALink                : "https://www.ceaa-acee.gc.ca/050/evaluations/proj/" + faker.random.number(99999) + "?culture=en-CA"
  , code                    : "TODO: name with spaces replaced by dashes"
  , commodity               : ''
  , currentPhaseName        : faker.random.arrayElement(currentPhaseNames)
  , dateAdded               : faker.date.past(10, Date.now())
  , dateCommentsClosed      : ''
  , dateCommentsOpen        : ''
  , dateUpdated             : faker.date.past(10, new Date())
  , decisionDate            : faker.date.past(10, new Date())
  , duration                : "90"
  // TODO: directoryStructure
  , eaoMember               : faker.random.arrayElement(["project-eao-staff", "system-eao"])

  //, epicProjectID           : { type: Number, default: 0 }
  , fedElecDist             : faker.random.arrayElement(federalElectoralDistricts)
  // TODO: intake
  , intake                  : ''
  , isTermsAgreed           : false
  , overallProgress         : 0
  , primaryContact          : require('mongoose').Types.ObjectId()
  , proMember               : "proponent-team"
  , provElecDist            : ''
  , sector                  : faker.random.arrayElement(sectors)
  , shortName               : name.replace(/[^A-Z0-9]/ig, "-")
  , status                  : faker.random.arrayElement(statuses)
  , substitution            : false

  // TODO: New Stuff?
  , eaStatusDate            : ''
  , eaStatus                : faker.random.arrayElement(eaStatuses)
  , projectStatusDate       : faker.date.past(10, new Date())
  , substantiallyDate       : faker.date.past(10, new Date())
  , substantially           : faker.random.boolean()
  , activeDate              : faker.date.past(10, new Date())
  , activeStatus            : ''

  /////////////////////
  // Contact references
  /////////////////////
  // Project Lead
  , projLead                : require('mongoose').Types.ObjectId()

  // Executive Project Director
  , execProjectDirector     : require('mongoose').Types.ObjectId()

  // Compliance & Enforcement Lead
  , complianceLead          : require('mongoose').Types.ObjectId()
  //////////////////////

  /////////////////////
  // PINs
  /////////////////////
  , pins                    : require('mongoose').Types.ObjectId()
  /*
    array of mixed:
    [{
      action: 'added' | 'removed',
      date: new Date(now).toISOString()
    }]
  */
 , pinsHistory            : {} 

 , groups                   : require('mongoose').Types.ObjectId()

  // Permissions
  , read                   : '["project-system-admin"]'
  , write                  : '["project-system-admin"]'
  , delete                 : '["project-system-admin"]'

}));

exports.factory = factory;