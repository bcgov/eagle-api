const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const Pin = require('../../helpers/models/pin');
let faker = require('faker/locale/en');

const factoryName = Pin.modelName;

factory.define(factoryName, Pin, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  let pinNum = factory.seq('Pin.number', (n) => `${n}`);
  let attrs = {
      name               : "pin-" + pinNum
    , number             : pinNum
    , address1           : faker.address.streetAddress()
    , address2           : faker.address.secondaryAddress()
    , city               : faker.random.arrayElement(factory_helper.getBcCities())
    , province           : "BC"
    , country            : "Canada"
    , postalCode         : factory_helper.generateFakePostal()
    , phone              : faker.phone.phoneNumberFormat(1)
    , fax                : faker.phone.phoneNumberFormat(1)
    , www                : faker.internet.url()
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
