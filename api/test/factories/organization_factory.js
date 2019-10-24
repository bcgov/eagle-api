const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const Organization = require('../../helpers/models/organization');
let faker = require('faker/locale/en');

const factoryName = Organization.modelName;

const companyTypes = [
  "Consultant"
  , "Indigenous Group"
  , "Local Government"
  , "Ministry"
  , "Municipality"
  , "Other Agency"
  , "Other Government"
  , "Proponent/Certificate Holder"
];

factory.define(factoryName, Organization, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  let author = factory_helper.generateFakePerson();
  let updator = faker.random.arrayElement([null, author, factory_helper.generateFakePerson()]);

  let dateUpdated = moment(faker.date.past(10, new Date()));
  let dateAdded = dateUpdated.clone().subtract(faker.random.number(45), 'days');
  let companyName = faker.company.companyName();
  if (0 == updator.length) dateUpdated = null;

  let attrs = {
      addedBy: author.idir
    , description: faker.lorem.paragraph()
    , name: companyName
    , updatedBy: updator.idir
    , dateAdded: dateAdded
    , dateUpdated: dateUpdated
    , country: "Canada"
    , postal: chance.postal()
    , province: "BC"
    , city: faker.random.arrayElement(factory_helper.getBcCities())
    , address1: faker.address.streetAddress()
    , address2: faker.address.secondaryAddress()
    , companyType: faker.random.arrayElement(companyTypes)
    , parentCompany: require('mongoose').Types.ObjectId()
    , companyLegal: ""
    , company: companyName

    , read             : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , write            : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , delete           : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
