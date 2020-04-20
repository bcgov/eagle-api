const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const NotificationProject = require('../../helpers/models/notificationProject');
let faker = require('faker/locale/en');

const notificationProjectNameSuffixes = [
  "Mine"
  , "Pit"
  , "Quarry"
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

const notificationProjectTypes = [
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

factory.define('notificationProject', NotificationProject, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  factory_helper.faker = faker;

  let notificationProject = faker.company.companyName() + " " + faker.random.arrayElement(notificationProjectNameSuffixes);
  let decisionDate = moment(faker.date.past(10, new Date()));
  let startDate = decisionDate.clone().subtract(faker.random.number(45), 'days');
  let associatedId = '100000000000000';
  let associatedFakeProject = "Not Real Project";
  let attrs = {
      _id                     : factory_helper.ObjectId()
    , name                    : faker.name.prefix()
    , type                    : faker.random.arrayElement(notificationProjectTypes)
    , subType                 : faker.random.arrayElement(sectors)
    , proponentName           : notificationProject
    , startDate               : startDate
    , decisionDate            : decisionDate
    , region                  : faker.random.arrayElement(regions)
    , associatedProjectId     : associatedId
    , associatedProjectName   : associatedFakeProject
    // TODO: This has not been set by the business yet.
    , notificationDecision    : ''
    
    , description             : faker.lorem.paragraph()
    , centroid                : factory_helper.generateFakeBcLatLong().centroid
    , read                    : faker.random.arrayElement([["public"], ["sysadmin"]])
    , write                   : faker.random.arrayElement([["public"], ["sysadmin"]])
    , delete                  : faker.random.arrayElement([["public"], ["sysadmin"]])
  }
  return attrs;
});

exports.factory = factory;
