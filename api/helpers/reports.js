const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;
const transform = require('stream-transform');
const moment = require('moment');
const csv = require('csv');
const fs = require('fs');

/**
 * Generates a report based on type.
 *
 * @param {string} reportType Type of report to create.
 * @returns {string} Temp file path of the report.
 */
exports.generateReport = async (reportType) => {
  switch (reportType) {
  case 'bcgw':
    return await createBcgwReport();
  default:
    throw new Error('Invalid report type');
  }
};

/**
 * Creates a BCGW report and stores it in a temporary location.
 * @returns {string} Temporary location of the report.
 */
const createBcgwReport = async () => {
  const collection = mongoose.connection.db.collection('read_only__reports__project_info');
  const tempFilePath = `/tmp/export-bcgw-${Date.now()}.csv`;
  const projection = {
    _id: 1,
    name: 1,
    proponent: 1,
    type: 1,
    subType: 1,
    description: 1,
    region: 1,
    currentPhaseName: 1,
    legislation: 1,
    IAACInvolvement: 1,
    eaDecision: 1,
    eaDecisionDate: 1,
    centroid: 1
  };

  try {
    const projects = await collection.find({ published: true }, { projection }).toArray();

    await new Promise((resolve, reject) => {
      transform(projects, (project) => {
        return {
          'Latitude': project.centroid[1],
          'Longitude': project.centroid[0],
          'Project name': project.name,
          'Proponent': project.proponent,
          'Type': project.type,
          'Sub-Type': project.subType,
          'Description': project.description,
          'MOE Region': project.region,
          'Project Phase': project.currentPhaseName,
          'Legislation': project.legislation,
          'Federal Involvement': project.IAACInvolvement,
          'EA Decision': project.eaDecision,
          'Decision Date': project.eaDecisionDate,
          'URL to Epic Project': `https://projects.eao.gov.bc.ca/p/${project._id}/project-details`,
          'Project GUID': project._id,
        };
      })
        .pipe(csv.stringify({
          header: true,
          cast: {
            object: (object) => {
              if(isObjectId(object))
                return object.toString();
              else
                return JSON.stringify(object);
            },
            date: (date) => {
              return moment(date).format('MM-DD-YYYY');
            }
          }
        }))
        .pipe(fs.createWriteStream(tempFilePath))
        .on('finish', resolve)
        .on('error', reject);
    });
  } catch (error) {
    throw new Error('Error generating CSV');
  }

  return tempFilePath;
};

/**
  * ObjectId.isValid() returns false positives on 12 character strings.
  * This function will handle that case.
  *
  * @param {string} idString String to check if valid Mongo ID.
  * @returns {boolean} Indicates if object ID or not.
  */
const isObjectId = (idString) => {
  // If a string converted to an Object ID has the same value then it is a valid ID.
  return new ObjectId(idString) === idString;
};
