/*
 * Pipeline class to pass along generated data such that it can be accessed as needed by factories requiring data
 * from previous stages, and so that each factory can pass along its results.
 */

const app_helper = require('../../../app_helper');
let defaultLog = app_helper.defaultLog;

class GeneratedData {
  constructor() {
    this.audit = null;
    this.lists = null;
    this.users = null;
    this.organizations = null;
    this.projects = null;
    this.projectDocuments = null;
    this.projectDocumentRecentActivities = null;
    this.commentPeriods = null;
    this.commentPeriodComments = null;
    this.commentPeriodDocuments = null;
    this.commentPeriodRecentActivities = null;
    this.groups = null;
  }

  report() {
    defaultLog.info('\n\n \
******* Generation Statistics *******\n \
*   ' + ((null == this.audit) ? 0 : this.audit.length) + ' Audits\n \
*   ' + ((null == this.lists) ? 0 : this.lists.length) + ' Lists\n \
*   ' + ((null == this.users) ? 0 : this.users.length) + ' Users\n \
*   ' + ((null == this.organizations) ? 0 : this.organizations.length) + ' Organizations\n \
*   ' + ((null == this.groups) ? 0 : this.groups.length) + ' Groups\n \
*   ' + ((null == this.projects) ? 0 : this.projects.length) + ' Projects\n \
*   ' + ((null == this.projectDocuments) ? 0 : this.projectDocuments.length) + ' Project Documents\n \
*   ' + ((null == this.projectDocumentRecentActivities) ? 0 : this.projectDocumentRecentActivities.length) + ' Project Document Recent Activities\n \
*   ' + ((null == this.commentPeriods) ? 0 : this.commentPeriods.length) + ' Comment Periods\n \
*   ' + ((null == this.commentPeriodComments) ? 0 : this.commentPeriodComments.length) + ' Comment Period Comments\n \
*   ' + ((null == this.commentPeriodDocuments) ? 0 : this.commentPeriodDocuments.length) + ' Comment Period Documents\n \
*   ' + ((null == this.commentPeriodRecentActivities) ? 0 : this.commentPeriodRecentActivities.length) + ' Comment Period Recent Activities\n \
*************************************\n\n');
  }
}

module.exports.GeneratedData = GeneratedData;
