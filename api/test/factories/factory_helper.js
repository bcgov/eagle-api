const faker = require('faker/locale/en');
const canada = require('canada');
const _ = require('lodash');

let bcCities = [];
loadBcCities();

function generateFakePerson(firstName, middleName, lastName) {
    let first = (firstName) ? firstName : faker.name.firstName();
    let middle = (middleName) ? middleName : faker.random.arrayElement(["", faker.name.firstName()]);
    let last = (lastName) ? lastName : faker.name.lastName();

    let full = first + " " + (("" == middle) ? "" : faker.random.arrayElement(["", middle.charAt(0) + ". "])) + last;
    let email = first.toLowerCase() + (faker.random.boolean() ? "." : "") + last.toLowerCase() + "@" + faker.internet.email().split("@").pop();
    // Active Directory Username, is stored in db as "idir\\sampleidir"
    let idir = "idir\\\\" + (first.charAt(0) + last).toLowerCase();

    return {
          "firstName": first
        , "middleName": middle
        , "lastName": last
        , "fullName": full
        , "emailAddress": email
        , "idir": idir
    };
}

function loadBcCities() {
    if (0 < bcCities.length) return;
    for (let i = 0; i < canada.cities.length; i++) {
        if ("bc" == canada.cities[i][1].toLowerCase()) bcCities.push(_.startCase(canada.cities[i][0].toLowerCase()).replace(/^([0-9a-zA-Z]+\s)*Mc([0-9a-zA-Z]*)(.*)/gi, function (original, before, mcSecondPart, theRest) {
            return (before) ? before : "" + "Mc" + _.startCase(mcSecondPart) + theRest;
        }));
    }
}

function getBcCities() {
    loadBcCities();
    return bcCities;
}

function generateFakeBcLatLong() {
    // 53.726669, -127.647621 centre of BC
    // We will make a rough box to mostly avoid the ocean and the jagged map bits on the Alberta side
    let latMin = 49.0323;       // 49.0323° N, 119.4682° W Osoyoos, Southern (bottom) box boundary
    let latMax = 59.9238;       // 59.9238° N, 128.4864° W Lower Post, Northern (top) box boundary
    let longMin = -128.6032;    // 54.5182° N, 128.6032° W Terrace, Western (left) box boundary
    let longMax = -120.2377;    // 55.7596° N, 120.2377° W Dawson Creek, Eastern (right) box boundary
    let altMax = 1300;          // Elkford is highest altitude city in BC

    let gennedLat = faker.random.number({min: latMin, max: latMax});
    let gennedLong = faker.random.number({min: longMin, max: longMax});
    let gennedAlt = faker.random.number({min: 1, max: altMax});
    return {
          lat: gennedLat
        , long: gennedLong
        , centroid: [gennedLong, gennedLat]
        , geo: {
              speed : -1
            , heading : -1
            , longitude : gennedLong
            , accuracy : 65
            , latitude : gennedLat
            , altitudeAccuracy : 10
            , altitude : gennedAlt
        }
    }
}

function generateFakeLocationString() {
    let nsAxis = faker.random.arrayElement(["", "N", "S"]);
    let ewAxis = faker.random.arrayElement(["", "E", "W"]);
    let spacer = ((0 == nsAxis.length) || (0 == ewAxis.length)) ? "" : " ";
    let filler = ((0 == nsAxis.length) && (0 == ewAxis.length)) ? faker.random.arrayElement(["N", "S", "E", "W"]) : "";
    let location = faker.random.number(200) + "km " + nsAxis + spacer + ewAxis + filler + " of " + faker.random.arrayElement(getBcCities());
    return location;
}

exports.getBcCities = getBcCities;
exports.generateFakeBcLatLong = generateFakeBcLatLong;
exports.generateFakePerson = generateFakePerson;
exports.generateFakeLocationString = generateFakeLocationString;
