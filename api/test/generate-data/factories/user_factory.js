const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const User = require('../../../helpers/models/user');
let faker = require('faker/locale/en');

let factoryName = User.modelName;

factory.define(factoryName, User, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  let person = factory_helper.generateFakePerson();
  let attrs = {
      firstName               : person.firstName
    , middleName              : person.middleName
    , lastName                : person.lastName
    , displayName             : person.fullName
    , email                   : person.emailAddress
    , org                     : require('mongoose').Types.ObjectId()
    , orgName                 : faker.company.companyName()
    , title                   : faker.name.title()
    , phoneNumber             : person.phoneNumber
    , salutation              : faker.name.prefix()
    , department              : faker.name.jobArea()
    , faxNumber               : person.faxNumber
    , cellPhoneNumber         : person.cellPhoneNumber
    , address1                : faker.address.streetAddress()
    , address2                : faker.address.secondaryAddress()
    , city                    : faker.random.arrayElement(factory_helper.getBcCities())
    , province                : "BC"
    , country                 : "Canada"
    , postalCode              : factory_helper.generateFakePostal()
    , notes                   : faker.random.arrayElement(["", faker.lorem.paragraph()])
    , read                    : faker.random.arrayElement(["public", "sysadmin"])
    , write                   : faker.random.arrayElement(["public", "sysadmin"])
    , delete                  : faker.random.arrayElement(["public", "sysadmin"])
  }
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
