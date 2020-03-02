const factory = require('factory-girl').factory;
const moment = require('moment');
const factory_helper = require('./factory_helper');
const Project = require('../../helpers/models/project');
let faker = require('faker/locale/en');

const factoryName = Project.modelName;

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
];

const statuses = [
    "Certified"
    , "In Progress"
    , "Initiated"
    , "Not Certified"
    , "Submitted"
];

const eaStatuses = [
    ""
    , "Requires EAC"
    , "Does not require EAC"
];

factory.define(factoryName, Project, buildOptions =>{
    if (buildOptions.faker) faker = buildOptions.faker;
    factory_helper.faker = faker;

    let usersPool = (buildOptions.usersPool) ? buildOptions.usersPool : null;
    let organizationsPool = (buildOptions.orgsPool) ? buildOptions.orgsPool : null;
    let listsPool = (buildOptions.listsPool) ? buildOptions.listsPool : null;
    const ceaaInvolvements = listsPool.filter(listEntry => "ceaaInvolvements" === listEntry.type);
    const eacDecisions = listsPool.filter(listEntry => "eaDecisions" === listEntry.type);
    const projectPhases = listsPool.filter(listEntry => "projectPhase" === listEntry.type);
    const regions = listsPool.filter(listEntry => "region" === listEntry.type);

    let projectName = faker.company.companyName() + " " + faker.random.arrayElement(projectNameSuffixes);
    let decisionDate = moment(faker.date.past(10, new Date()));
    let dateUpdated = decisionDate.clone().subtract(faker.random.number(45), 'days'); // 45 days is the max allowed
    let projectStatusDate = dateUpdated.clone().subtract(faker.random.number(45), 'days');
    let substantiallyDate = projectStatusDate.clone().subtract(faker.random.number(45), 'days');
    let disputeDate = projectStatusDate.clone().subtract(faker.random.number(45), 'days');
    // order dependent chain backwards in time so that the dates make sense
    let activeDate = substantiallyDate.clone().subtract(faker.random.number(45), 'days'); // company or staff is doing work, 'active' is a state
    let dateAdded = activeDate.clone().subtract(faker.random.number(45), 'days');
    let projectLead = factory_helper.generateFakePerson();
    let responsibleEpd = factory_helper.generateFakePerson();
    let legislationNumber = faker.random.arrayElement([1996, 2002, 2018]);
    let projectPhase = factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(projectPhases));

    let baseProjectData = {
        //Needed for default view
          CEAAInvolvement         : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(ceaaInvolvements))
        , CELead                  : "Compliance & Enforcement Branch"
        , CELeadEmail             : "eao.compliance@gov.bc.ca"
        , CELeadPhone             : factory_helper.generateEpicFormatPhoneNumber()
        , centroid                : factory_helper.generateFakeBcLatLong().centroid
        , description             : faker.lorem.paragraph()
        , eacDecision             : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(eacDecisions))
        , location                : factory_helper.generateFakeLocationString()
        , name                    : projectName
        , projectLeadId           : factory_helper.ObjectId()
        , projectLead             : projectLead.fullName
        , projectLeadEmail        : projectLead.emailAddress
        , projectLeadPhone        : projectLead.phoneNumber
        , proponent               : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(organizationsPool))
        , region                  : factory_helper.getRandomExistingListElementName(regions)
        , responsibleEPDId        : factory_helper.ObjectId()
        , responsibleEPD          : responsibleEpd.fullName
        , responsibleEPDEmail     : responsibleEpd.emailAddress
        , responsibleEPDPhone     : responsibleEpd.phoneNumber
        , type                    : faker.random.arrayElement(projectTypes)
        , legislation             : "2002 Environmental Assessment Act"


        //Everything else
        , addedBy                 : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(usersPool))
        , build                   : faker.random.arrayElement(projectBuilds)
        , CEAALink                : "https://www.ceaa-acee.gc.ca/050/evaluations/proj/" + faker.random.number(99999) + "?culture=en-CA"
        , code                    : projectName.replace(/[^A-Z0-9]/ig, "-").replace(/(\-)(\1+)/, "-").toLowerCase()
        , commodity               : ""
        , currentPhaseName        : projectPhase
        , phaseHistory            : [projectPhase]
        , dateAdded               : dateAdded
        , dateCommentsClosed      : null
        , dateCommentsOpen        : null
        , dateUpdated             : dateUpdated
        , decisionDate            : decisionDate
        , duration                : "90"
        , eaoMember               : faker.random.arrayElement(["project-eao-staff", "system-eao"])
        , fedElecDist             : faker.random.arrayElement(federalElectoralDistricts)
        , intake                  : {
            "section7optin" : "",
            "operatingjobsNotes" : "",
            "operatingjobs" : "2",
            "meetsrprcriteria" : "",
            "meetsCEAACriteria" : "",
            "lifespan" : "",
            "investmentNotes" : "",
            "investment" : "200000000",
            "contactedFirstNations" : "",
            "contactedCEAA" : "",
            "constructionjobsNotes" : "",
            "constructionjobs" : "300",
            "affectedFirstNations" : ""
        }
        , isTermsAgreed           : false
        , overallProgress         : 0
        , primaryContact          : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(usersPool))
        , proMember               : "proponent-team"
        , provElecDist            : ""
        , sector                  : faker.random.arrayElement(sectors)
        , shortName               : projectName.replace(/[^A-Z0-9]/ig, "-").replace(/(\-)(\1+)/, "-")
        , status                  : faker.random.arrayElement(statuses)
        , substitution            : false
        , eaStatusDate            : ""
        , eaStatus                : faker.random.arrayElement(eaStatuses)
        , projectStatusDate       : projectStatusDate
        , substantiallyDate       : substantiallyDate
        , substantially           : faker.random.boolean()
        , disputeDate             : disputeDate
        , dispute                 : faker.random.boolean()
        , activeDate              : activeDate
        , activeStatus            : ""

        // Project Review Data
        , review180Start          : null
        , review45Start           : null
        , reviewSuspensions       : null
        , reviewExtensions        : null

        /////////////////////
        // Contact references
        /////////////////////
        // Project Lead
        , projLead                : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(usersPool))

        // Executive Project Director
        , execProjectDirector     : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(usersPool))

        // Compliance & Enforcement Lead
        , complianceLead          : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(usersPool))
        //////////////////////

        , groups                  : factory_helper.ObjectId()

    }

    let projectDataLeg1996 = JSON.parse(JSON.stringify(baseProjectData))
    , projectDataLeg2002 = JSON.parse(JSON.stringify(baseProjectData))
    , projectDataLeg2018 = JSON.parse(JSON.stringify(baseProjectData));
    
    // customize any 1996 legislation specific fields here:
    projectDataLeg1996.legislation = "1996 Environmental Assessment Act";
    projectDataLeg1996.legislationYear = 1996;

    // customize any 2002 legislation specific fields here:
    projectDataLeg2002.legislation = "2002 Environmental Assessment Act";
    projectDataLeg2002.legislationYear = 2002;

    // customize any 2018 legislation specific fields here:
    projectDataLeg2018.legislation = "2018 Environmental Assessment Act";
    projectDataLeg2018.legislationYear = 2018;

    let legacyRoll2002 = faker.random.boolean();
    let legacyRoll1996 = faker.random.boolean();
    let legislationYearList = [];

    switch (legislationNumber) {
        case 1996:
          legislationYearList.push(1996);
          break;
        case 2002:
          if (legacyRoll1996) legislationYearList.push(1996);
          legislationYearList.push(2002);
          break;
        case 2018:
          if (legacyRoll1996 && legacyRoll2002) legislationYearList.push(1996);
          if (legacyRoll2002) legislationYearList.push(2002);
          legislationYearList.push(2018);
          break;
      }

    
    let attrs = {
        _id                       : factory_helper.ObjectId()
      , currentLegislationYear    : legislationNumber
      , legislationYearList       : legislationYearList

      // Permissions
      , read                    : ["sysadmin", "project-proponent", "project-system-admin", "public"]
      , write                   : ["sysadmin", "project-system-admin"]
      , delete                  : ["sysadmin", "project-system-admin"]
      , pins                      : [factory_helper.ObjectId()]
      , pinsRead                  : ["sysadmin", "project-proponent", "project-system-admin", "public"]
      , pinsHistory               : {}
      , links: []
    };

    if (legislationYearList.includes(1996)) attrs.legislation_1996 = projectDataLeg1996;
    if (legislationYearList.includes(2002)) attrs.legislation_2002 = projectDataLeg2002;
    if (legislationYearList.includes(2018)) attrs.legislation_2018 = projectDataLeg2018;

    return attrs;

});

exports.factory = factory;
exports.name = factoryName;
