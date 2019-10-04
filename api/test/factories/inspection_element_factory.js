const factory = require('factory-girl').factory;
const faker = require('faker/locale/en');
const factory_helper = require('./factory_helper');
const InspectionElement = require('../../helpers/models/inspectionElement');

factory.define('inspectionElement', InspectionElement, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  
  let author = factory_helper.generateFakePerson();
  let updator = faker.random.arrayElement([null, author, factory_helper.generateFakePerson()]);
  let deletor = faker.random.arrayElement([null, author, updator, factory_helper.generateFakePerson()]);

  let updatedDate = moment(faker.date.past(10, new Date()));
  let createdDate = updatedDate.clone().subtract(faker.random.number(45), 'days');
  let timestamp = createdDate.clone();
  let fakeBcLatLong = factory_helper.generateFakeBcLatLong();
  if (0 == updator.length) updatedDate = null;

  let attrs = {
    // Tracking
      _schemaName: "InspectionElement"
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

    // Meta
    , title       : faker.lorem.sentence()
    , requirement : faker.lorem.sentence()
    , description : "\nLat: " + fakeBcLatLong.lat + ", Long:" + fakeBcLatLong.long + "\n"
    , timestamp   : timestamp
    // Items
    , items: [require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId()],
  };
  return attrs;
});

exports.factory = factory;
