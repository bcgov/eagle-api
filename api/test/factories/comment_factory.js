const factory = require('factory-girl').factory;
const Comment = require('../../helpers/models/comment');
const factory_helper = require('./factory_helper');
const moment = require('moment');
let faker = require('faker/locale/en');

const factoryName = Comment.modelName;

const eaoStatuses = [
  "Deferred"
  , "Published"
  , "Rejected"
  , "Unvetted"
];

factory.define(factoryName, Comment, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  factory_helper.faker = faker;

  let author = factory_helper.generateFakePerson();
  let dateAdded = moment(faker.date.past(10, new Date()));
  let datePosted = dateAdded.clone().subtract(faker.random.number(7), 'days');
  let dateUpdated = datePosted.clone().subtract(faker.random.number(7), 'days');

  let attrs = {
      _id                 : factory_helper.ObjectId()
    , author              : author.fullName
    , comment             : faker.lorem.paragraph()
    , dateAdded           : dateAdded
    , datePosted          : datePosted
    , dateUpdated         : dateUpdated
    , documents           : factory_helper.ObjectId()
    , eaoNotes            : faker.lorem.paragraph()
    , eaoStatus           : faker.random.arrayElement(eaoStatuses)
    , isAnonymous         : faker.random.boolean()
    , location            : factory_helper.generateFakeLocationString()
    , period              : factory_helper.ObjectId()
    , proponentNotes      : faker.lorem.paragraph()
    , proponentStatus     : ""
    , publishedNotes      : faker.lorem.paragraph()
    , rejectedNotes       : faker.lorem.paragraph()
    , rejectedReason      : ""
    , submittedCAC        : false
    , valuedComponents    : [factory_helper.ObjectId(), factory_helper.ObjectId(), factory_helper.ObjectId()]

    // Number auto-incremented.  Do not set manually.
    , commentId           : factory.seq('Comment.commentId', (n) => Number(`${n}`))

    // Permissions
    , write               : ["project-system-admin"]
    , read                : faker.random.arrayElement([["public"], ["public", "project-system-admin"]])
    , delete              : ["project-system-admin"]
  }
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
