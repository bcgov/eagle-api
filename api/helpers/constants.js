exports.schemaTypes = Object.freeze({
  ITEM: 'Item',
  DOCUMENT: 'Document',
  CAC: 'CACUser',
  PROJECT: 'Project',
  GROUP: 'Group',
  USER: 'User',
  RECENT_ACTIVITY: 'RecentActivity',
  INSPECTION: 'Inspection',
  INSPECTION_ELEMENT: 'InspectionElement',
  PROJECT_NOTIFICATION: 'ProjectNotification',
  LIST: 'List',
  COMMENT: 'Comment',
  COMMENT_PERIOD: 'CommentPeriod',
  ORGANIZATION: 'Organization',
});

exports.MAX_FEATURE_DOCS = 5;

exports.PUBLIC_ROLES = ['public'];
exports.SECURE_ROLES = ['sysadmin', 'staff'];

// Legislation registry, keyed by year. A project keeps one sub-document per year under `legislation_<year>`.
// Adding an Act: add its entry here and its year to the project POST and publish prose in swagger.yaml (a test checks).
// `label`: the `legislation` string written on the project; eagle-public matches on it.
// `isDefault`: year a POST without `legislationYear` uses and the $switch fallback; exactly one entry.
// `locked`: PUT and publish never move a project off this Act (the admin forms only know the B.C. Acts).
const LEGISLATIONS = Object.freeze({
  1996: Object.freeze({ label: '1996 Environmental Assessment Act' }),
  2002: Object.freeze({ label: '2002 Environmental Assessment Act', isDefault: true }),
  2018: Object.freeze({ label: '2018 Environmental Assessment Act' }),
  2025: Object.freeze({ label: 'Building Canada Act', locked: true })
});

const KEY_PREFIX = 'legislation_';
const KEY_PATTERN = /^legislation_(\d+)$/;

/**
 * @param {number|string} year Legislation year.
 * @returns {string|null} The project block key for a registry year, null for any other value.
 */
const legislationKey = year => (Object.prototype.hasOwnProperty.call(LEGISLATIONS, year) ? KEY_PREFIX + year : null);

/**
 * @param {string} key Project block key, as stored in `currentLegislationYear`.
 * @returns {number|null} The registry year the key names, null for any other value.
 */
const legislationYearOf = key => {
  const match = typeof key === 'string' && KEY_PATTERN.exec(key);
  return match && legislationKey(match[1]) === key ? Number(match[1]) : null;
};

const LEGISLATION_KEYS = Object.freeze(Object.keys(LEGISLATIONS).map(legislationKey));
const DEFAULT_LEGISLATION_YEAR = Number(Object.keys(LEGISLATIONS).find(year => LEGISLATIONS[year].isDefault));
const LOCKED_KEYS = Object.freeze(Object.keys(LEGISLATIONS).filter(year => LEGISLATIONS[year].locked).map(legislationKey));

/**
 * Builds the $switch that picks a project's current legislation sub-document.
 * Lives here rather than in aggregators.js because utils.js needs it and aggregators.js requires utils.js.
 *
 * @param {string} prefix Path to the project, '' for the root or 'project.' for a joined project.
 * @returns {object} $switch expression, falling back to the default year's block.
 */
const legislationSwitch = (prefix = '') => ({
  $switch: {
    branches: LEGISLATION_KEYS.map(key => ({
      case: { $eq: [ '$' + prefix + 'currentLegislationYear', key ]},
      then: '$' + prefix + key
    })),
    default: '$' + prefix + legislationKey(DEFAULT_LEGISLATION_YEAR)
  }
});

exports.LEGISLATIONS = LEGISLATIONS;
exports.LEGISLATION_KEYS = LEGISLATION_KEYS;
exports.DEFAULT_LEGISLATION_YEAR = DEFAULT_LEGISLATION_YEAR;
exports.LOCKED_KEYS = LOCKED_KEYS;
exports.legislationKey = legislationKey;
exports.legislationYearOf = legislationYearOf;
exports.legislationSwitch = legislationSwitch;
