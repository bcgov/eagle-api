const factory = require('factory-girl').factory;
const Comment = require('../../helpers/models/comment');
const factory_helper = require('./factory_helper');
const faker = require('faker/locale/en');
const moment = require('moment');

const eaoStatuses = [
  "Deferred"
  , "Published"
  , "Rejected"
  , "Unvetted"
];

factory.define('comment', Comment, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  let author = factory_helper.generateFakePerson();
  let dateAdded = moment(faker.date.past(10, new Date()));
  let datePosted = dateAdded.clone().subtract(faker.random.number(7), 'days');
  let dateUpdated = datePosted.clone().subtract(faker.random.number(7), 'days');

  let attrs = {
      author              : author.fullName
    , comment             : faker.lorem.paragraph()
    , dateAdded           : dateAdded
    , datePosted          : datePosted
    , dateUpdated         : dateUpdated
    , documents           : require('mongoose').Types.ObjectId()
    , eaoNotes            : faker.lorem.paragraph()
    , eaoStatus           : faker.random.arrayElement(eaoStatuses)
    , isAnonymous         : faker.random.boolean()
    , location            : factory_helper.generateFakeLocationString()
    , period              : require('mongoose').Types.ObjectId()
    , proponentNotes      : faker.lorem.paragraph()
    , proponentStatus     : ""
    , publishedNotes      : faker.lorem.paragraph()
    , rejectedNotes       : faker.lorem.paragraph()
    , rejectedReason      : ""
    , valuedComponents    : [require('mongoose').Types.ObjectId(),require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId()]

    // Number auto-incremented.  Do not set manually.
    , commentId           : factory.seq('Comment.commentId', (n) => Number(`${n}`))

    // Permissions
    , write               : '["project-system-admin"]'
    , read                : '["project-system-admin"]'
    , delete              : '["project-system-admin"]'
  }
  return attrs;
});

exports.factory = factory;
