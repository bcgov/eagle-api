const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const moment = require('moment');
const RecentActivity = require('../../helpers/models/recentActivity');
let faker = require('faker/locale/en');

const factoryName = RecentActivity.modelName;

factory.define(factoryName, RecentActivity, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  factory_helper.faker = faker;

  let usersPool = (buildOptions.pipeline) ? 
    (buildOptions.pipeline.users) ? buildOptions.pipeline.users : null :
    (buildOptions.usersPool) ? buildOptions.usersPool : null;

  let listsPool = (buildOptions.pipeline) ? 
    (buildOptions.pipeline.lists) ? buildOptions.pipeline.lists : null :
    (buildOptions.listsPool) ? buildOptions.listsPool : null;
  const headlineTypes = (null == listsPool) ? [] : listsPool.filter(listEntry => "headlineType" === listEntry.type);
  
  let raType = faker.random.arrayElement(["News", "Public Comment Period"]);
  let dateUpdated = moment(faker.date.past(10, new Date()));
  let dateAdded = dateUpdated.clone().subtract(faker.random.number(45), 'days');
  
  let attrs = {
      _id                 : factory_helper.ObjectId()
    , dateUpdated         : dateUpdated
    , dateAdded           : dateAdded
    , _addedBy            : factory_helper.getRandomExistingMongoId(usersPool)
    , _updatedBy          : factory_helper.getRandomExistingMongoId(usersPool)
    , pinned              : faker.random.boolean()
    , documentUrl         : ("News" == raType) ? "/api/document/" + factory_helper.ObjectId() + "/fetch": ""

    //TODO link up the project name here
    , contentUrl          : ("Public Comment Period" == raType) ? "/p/PROJECT-SHORT-NAME-HERE/commentperiod/" + factory_helper.ObjectId() + "": ""
 
    , type                : raType
    , pcp                 : factory_helper.ObjectId()
    , active              : faker.random.boolean()
    , project             : factory_helper.ObjectId()
    , content             : faker.lorem.paragraph()
    , headline            : factory_helper.getRandomExistingListElementName(headlineTypes)

    // Permissions
    , read                : faker.random.arrayElement(["public", "sysadmin"])
    , write               : faker.random.arrayElement(["public", "sysadmin"])
    , delete              : faker.random.arrayElement(["public", "sysadmin"])
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
