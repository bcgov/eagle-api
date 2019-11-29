const factory = require('factory-girl').factory;
const moment = require('moment');
const RecentActivity = require('../../helpers/models/recentActivity');
let faker = require('faker/locale/en');

const factoryName = RecentActivity.modelName;

factory.define(factoryName, RecentActivity, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  let usersPool = (buildOptions.usersPool) ? buildOptions.usersPool : null;
  
  let raType = faker.random.arrayElement(["News", "Public Comment Period"]);
  let dateUpdated = moment(faker.date.past(10, new Date()));
  let dateAdded = dateUpdated.clone().subtract(faker.random.number(45), 'days');
  let attrs = {
      dateUpdated         : dateUpdated
    , dateAdded           : dateAdded
    , _addedBy            : factory_helper.getRandomExistingMongoId(usersPool)
    , _updatedBy          : factory_helper.getRandomExistingMongoId(usersPool)
    , pinned              : faker.random.boolean()
    , documentUrl         : ("News" == raType) ? "/api/document/" + require('mongoose').Types.ObjectId() + "/fetch": ""

    //TODO link up the project name here
    , contentUrl          : ("Public Comment Period" == raType) ? "/p/PROJECT-SHORT-NAME-HERE/commentperiod/" + require('mongoose').Types.ObjectId() + "": ""
 
    , type                : raType
    , pcp                 : require('mongoose').Types.ObjectId()
    , active              : faker.random.boolean()
    , project             : require('mongoose').Types.ObjectId()
    , content             : faker.lorem.paragraph()
    , headline            : faker.lorem.sentence()

    // Permissions
    , read             : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , write            : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , delete           : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
