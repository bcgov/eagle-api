const canada = require('canada');
const _ = require('lodash');
const bsonObjectId = require('bson').ObjectId;
const mongTypes = require('mongoose').Types;
let faker = require('faker/locale/en');
const fs = require('fs');
const path = require('path');
const shell = require('shelljs');
const HummusRecipe = require('hummus-recipe');

let bcCities = [];
loadBcCities();

const idirMaxAllowedChars = 8;

function generateFakePerson(firstName, middleName, lastName) {
    let first = (firstName) ? firstName : faker.name.firstName();
    let middle = (middleName) ? middleName : faker.random.arrayElement(["", faker.name.firstName()]);
    let last = (lastName) ? lastName : faker.name.lastName();

    let full = first + " " + (("" == middle) ? "" : faker.random.arrayElement(["", middle.charAt(0) + ". "])) + last;
    let email = first.toLowerCase() + (faker.random.boolean() ? "." : "") + last.toLowerCase() + "@" + faker.internet.email().split("@").pop();
    // Active Directory Username, is stored in db as "idir\\sampleidir"
    let idir = "idir\\" + ((first.charAt(0) + last).toLowerCase()).substring(0,idirMaxAllowedChars);
    let phoneNumber = generateEpicFormatPhoneNumber();
    let faxNumber = generateEpicFormatPhoneNumber();
    let cellPhoneNumber = generateEpicFormatPhoneNumber();

    return {
          "firstName": first
        , "middleName": middle
        , "lastName": last
        , "fullName": full
        , "emailAddress": email
        , "idir": idir
        , "phoneNumber": phoneNumber
        , "faxNumber": faxNumber
        , "cellPhoneNumber": cellPhoneNumber
    };
}

function generateEpicFormatPhoneNumber() {
    // https://en.wikipedia.org/wiki/List_of_British_Columbia_area_codes
    return faker.phone.phoneNumberFormat(1).replace(/([()]*)/gi, '').replace(/^.{3}/gi, faker.random.arrayElement(["604","250","778","236","672"]));
}

function getRandomExistingMongoId(objectIdsPool) {
    return  (objectIdsPool && objectIdsPool.length > 0) ? generateSeededObjectId(faker.random.arrayElement(objectIdsPool)._id) : generateSeededObjectId();
}

function getRandomExistingListElementName(objectIdsPool) {
    return  (objectIdsPool && objectIdsPool.length > 0) ? faker.random.arrayElement(objectIdsPool).name : "";
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

function generateFakePostal() {
    let pdPool = "XVTSRPNKLMHJGECBA".split("");
    let remPool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    let postalDistrict = faker.random.arrayElement(pdPool);
    let forwardSortationArea = postalDistrict + "#" + faker.random.arrayElement(remPool);
    let localDeliveryUnit = "#" + faker.random.arrayElement(remPool) + "#";
    return faker.helpers.replaceSymbolWithNumber(forwardSortationArea + " " + localDeliveryUnit);
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

function hexaDecimal(count) {
    if (typeof count === "undefined") {
      count = 1;
    }

    var wholeString = "";
    for(var i = 0; i < count; i++) {
      wholeString += faker.random.arrayElement(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "A", "B", "C", "D", "E", "F"]);
    }

    return wholeString;
}

function generateSeededObjectId(value) {
    let oid = (typeof value === "undefined") ? hexaDecimal(24).toLocaleLowerCase() : value;
    if (!bsonObjectId.isValid(oid)) throw "Invalid attempt to generate an ObjectID: '" + oid + "'";
    return mongTypes.ObjectId(oid);
}

let index = 1;

function getInc() {
    return (index + 1) % 0xffffff;
}

// when generating multiple projects' worth of data we need seeds that follow a repeatable
// pattern when the generators are set to static but are distinct values in order to avoid collisions
function generateDeterministicSeed(commonFactorySeed, parentId) {
    return (commonFactorySeed * 1000000) + Number(parentId.toString().replace(/a|b|c|d|e|f/gi, "").substr(0, 5)) + getInc();
}

function touchPath(pathToTouch) {
    try {
        const time = new Date();
        fs.utimesSync(pathToTouch, time, time);
    } catch (err) {
        fs.closeSync(fs.openSync(pathToTouch, 'w'));
    }
}

let epicAppTmpBasePath = path.sep + "tmp" + path.sep + "epic" + path.sep;
let generatedDocBasePath = epicAppTmpBasePath + "sampleGeneratedDocs" + path.sep;
shell.mkdir('-p', generatedDocBasePath);

const generatedDocExt = ".pdf";

// sizes based on EPIC representative samples
const generatedDocSamples = {
    S: generatedDocBasePath + "Small" + generatedDocExt,
    M: generatedDocBasePath + "Medium" + generatedDocExt,
    L: generatedDocBasePath + "Large" + generatedDocExt
};

// expensive, do this minimally and use the cached results
async function generatePrerequisitePdf(filepath, iterationSize) {
    if (!fs.existsSync(filepath)) {
        const fillerPDF = './api/test/factories/document_filler.pdf';
        const pdfDoc = new HummusRecipe('new', filepath,{
            version: 1.0,
            author: 'Document Factory',
            title: 'Test Document',
            subject: 'Generated PDF document for document factory testing'
          });
        for (let i = 0; i < iterationSize; i++) {
            pdfDoc.appendPage(fillerPDF);
        }
        await pdfDoc.endPDF();
    }
};

async function generatePrerequisitePdfs() {
    await generatePrerequisitePdf(generatedDocSamples.S, 3);
    await generatePrerequisitePdf(generatedDocSamples.M, 25);
    await generatePrerequisitePdf(generatedDocSamples.L, 120);
};

function endsWithPathSep(pathToCheck) {
    return ((0 < pathToCheck.length) && (path.sep == pathToCheck.slice(-1))) ? pathToCheck : pathToCheck + path.sep;
}

function editableObjToJSON(documentObject) { // for consistency
return JSON.stringify(documentObject, null, '\t');
}

exports.faker = faker;
exports.getBcCities = getBcCities;
exports.generateFakePostal = generateFakePostal;
exports.generateFakeBcLatLong = generateFakeBcLatLong;
exports.generateFakePerson = generateFakePerson;
exports.getRandomExistingMongoId = getRandomExistingMongoId;
exports.getRandomExistingListElementName = getRandomExistingListElementName;
exports.generateFakeLocationString = generateFakeLocationString;
exports.generateEpicFormatPhoneNumber = generateEpicFormatPhoneNumber;
exports.ObjectId = generateSeededObjectId;
exports.getInc = getInc;
exports.generateDeterministicSeed = generateDeterministicSeed;
exports.generatedDocSamples = generatedDocSamples;
exports.generatePrerequisitePdfs = generatePrerequisitePdfs;
exports.endsWithPathSep = endsWithPathSep;
exports.epicAppTmpBasePath = epicAppTmpBasePath;
exports.touchPath = touchPath;
exports.hexaDecimal = hexaDecimal;
exports.editableObjToJSON = editableObjToJSON;