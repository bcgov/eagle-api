const factory = require('factory-girl').factory;
const faker = require('faker/locale/en');
const moment = require('moment');
const RecentActivity = require('../../helpers/models/recentActivity');

factory.define('recentActivity', RecentActivity, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  
  let raType = faker.random.arrayElement(["News", "Public Comment Period"]);
  let dateUpdated = moment(faker.date.past(10, new Date()));
  let dateAdded = dateUpdated.clone().subtract(faker.random.number(45), 'days');
  let attrs = {
      dateUpdated         : dateUpdated
    , dateAdded           : dateAdded
    , _addedBy            : require('mongoose').Types.ObjectId()
    , _updatedBy          : require('mongoose').Types.ObjectId()
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
