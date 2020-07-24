const fs = require('fs');
const actions = require('../helpers/actions');
const reportUtils = require('../helpers/reports');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};


exports.publicGet = async function (args, res) {
  const reportType = args.swagger.params.type && args.swagger.params.type.value;

  if (!reportType) {
    return actions.sendResponse(res, 400, { error: 'Missing report type' });
  }

  try {
    const reportPath = await reportUtils.generateReport(reportType);

    fs.readFile(reportPath, (err, data) => {
      if (err) {
        return actions.sendResponse(res, 400, { error: 'Error generating report' });
      }
      // Delete the file.
      fs.unlinkSync(reportPath);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-disposition', `attachment; filename=export_${reportType}.csv`);

      res.send(data);
    });
  } catch (error) {
    return actions.sendResponse(res, 400, { error: error.message });
  }
};
