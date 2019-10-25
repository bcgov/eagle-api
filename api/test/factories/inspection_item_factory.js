const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const InspectionItem = require('../../helpers/models/inspectionItem');
let faker = require('faker/locale/en');

const factoryName = InspectionItem.modelName;

const inspectionItemTypes = [
    "photo"
  , "audio"
  , "video"
]

factory.define(factoryName, InspectionItem, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  
  let author = factory_helper.generateFakePerson();
  let updator = faker.random.arrayElement([null, author, factory_helper.generateFakePerson()]);
  let deletor = faker.random.arrayElement([null, author, updator, factory_helper.generateFakePerson()]);
  let itemDate = moment(faker.date.past(10, new Date()));
  if (0 == updator.length) updatedDate = null;

  let fakeBcLatLong = factory_helper.generateFakeBcLatLong();
  let attrs = {
    // Tracking
      _schemaName: "InspectionItem"
    , _createdDate    : createdDate
    , _updatedDate    : updatedDate
    , _addedBy        : author.idir
    , _updatedBy      : updator.idir
    , _deletedBy      : deletor.idir

    // Note: Default on tag property is purely for display only, they have no real effect on the model
    // This must be done in the code.
    , read             : faker.random.arrayElement(['["inspector"]', '["sysadmin"]', '["inspector"], ["sysadmin"]'])
    , write            : faker.random.arrayElement(['["inspector"]', '["sysadmin"]', '["inspector"], ["sysadmin"]'])
    , delete           : faker.random.arrayElement(['["inspector"]', '["sysadmin"]', '["inspector"], ["sysadmin"]'])

    // Not editable
    , type : faker.random.arrayElement(inspectionItemTypes)
    , uri  : ""
    , geo  : fakeBcLatLong.geo
    , caption : faker.lorem.sentence()
    , timestamp : itemDate

    // Minio handler
    , internalURL      : ""
    , internalExt      : ""
    , internalSize     : ""
    , internalMime     : ""
  };

  switch(attrs.type) {
    case "photo":
      attrs.internalExt = "jpg";
      attrs.internalSize = faker.random.number({min: 500, max: 5000000});
      attrs.internalMime = "image/jpeg";
      break;
    case "audio":
      attrs.internalExt = "m4a";
      attrs.internalSize = faker.random.number({min: 500, max: 1000000});
      attrs.internalMime = "audio/x-m4a";
      break;
    case "video":
      attrs.internalExt = "mov";
      attrs.internalSize = faker.random.number({min: 500000, max: 50000000});
      attrs.internalMime = "video/quicktime";
      break;
    default:
      throw "Undedermined inspection item factory type: '" + attrs.type + "'"
  }
  attrs.internalURL = require('mongoose').Types.ObjectId() + "/" + require('mongoose').Types.ObjectId() + "." + attrs.internalExt;

  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
