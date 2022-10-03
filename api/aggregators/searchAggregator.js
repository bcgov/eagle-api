const mongoose = require('mongoose');
const fuzzySearch = require('../helpers/fuzzySearch');
const aggregateHelper = require('../helpers/aggregators');
const constants = require('../helpers/constants').schemaTypes;
const favoriteAggregator = require('../aggregators/favoriteAggregator');


/**
 * Create an aggregation that sets the matching criteria for search.
 *
 * @param {string} schemaName Schema being searched on
 * @param {string} projectId Project ID
 * @param {string} keywords List of keywords to search on
 * @param {boolean} caseSensitive Case sensitive search?
 * @param {array} orModifier Search criteria for an 'or' search
 * @param {array} andModifier Search criteria for an 'and' search
 * @param {array} roles User's roles
 *
 * @returns {array} Aggregation for a match
 */
exports.createMatchAggr = async (schemaName, projectId, keywords, caseSensitive, orModifier, andModifier, roles, fuzzy = false, userId = null) => {
  const aggregation = [];
  let projectModifier;
  let keywordModifier;
  let favoritesModifier;
  let favoritesOnly;
  if (andModifier) {
    favoritesOnly = andModifier.favoritesOnly;
    delete andModifier.favoritesOnly;
    delete andModifier.changedInLast30days;
  }

  if (projectId) {
    projectModifier = { project: mongoose.Types.ObjectId(projectId) };
  }

  if (keywords) {
    keywords = keywords.replace(/"/g,"").trim();
    let keywordSearch = fuzzy && !keywords.startsWith("\"") && !keywords.endsWith("\"") ? fuzzySearch.createFuzzySearchString(keywords, 4, caseSensitive) : "\""+ keywords +"\"";
    keywordModifier = { $text: { $search: keywordSearch, $caseSensitive: caseSensitive } };
  }

  // query modifiers
  const andExpArray = await aggregateHelper.generateExpArray(andModifier, roles, schemaName);

  // filters
  const orExpArray = await aggregateHelper.generateExpArray(orModifier, roles, schemaName);

  let modifier = {};
  if (andExpArray.length > 0 && orExpArray.length > 0) {
    modifier = { $and: [{ $and: andExpArray }, { $or: orExpArray }] };
  } else if (andExpArray.length === 0 && orExpArray.length > 0) {
    modifier = { $and: orExpArray };
  } else if (andExpArray.length > 0 && orExpArray.length === 0) {
    modifier = { $and: andExpArray };
  }

  aggregation.push({
    $match: {
      _schemaName: schemaName,
      ...(aggregateHelper.isEmpty(modifier) ? undefined : modifier),
      ...(projectModifier ? projectModifier : undefined),
      ...(keywordModifier ? keywordModifier : undefined),
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
      ]
    }
  });

  if (favoritesOnly) {
    favoritesModifier = favoriteAggregator.createFavoritesOnlyAggr(userId, constants.PROJECT);
    aggregation.push(...favoritesModifier);
  }

  // Check document permissions
  aggregation.push(
    {
      $redact: {
        $cond: {
          if: {
            // This way, if read isn't present, we assume public no roles array.
            $and: [
              { $cond: { if: '$read', then: true, else: false } },
              {
                $anyElementTrue: {
                  $map: {
                    input: '$read',
                    as: 'fieldTag',
                    in: { $setIsSubset: [['$$fieldTag'], roles] }
                  }
                }
              }
            ]
          },
          then: '$$KEEP',
          else: {
            $cond: { if: '$read', then: '$$PRUNE', else: '$$DESCEND' }
          }
        }
      }
    },
    {
      $addFields: {
        score: { $meta: 'textScore' }
      }
    }
  );

  return aggregation;
};

exports.createKeywordRegexAggr = function(decodedKeywords, schemaName) {
  let keywordRegexFilter = [];
  // if we have a keyword search, and it is not wrapped in quotes (ie, phrase searching)
  // then do a regex match. To help keep regex matches closer to their values, also
  // filter on the score
  if (decodedKeywords && !decodedKeywords.startsWith("\"") && !decodedKeywords.endsWith("\"")) {
    // decodedKeywords is a const, so split, then join on the result or it'll
    // throw an error about const assignment. Leave decodedKeyword immutable.
    let terms = decodedKeywords.split(' ');
    let searchTerm = terms.join('|');

    // By default, if we're doing a keyword search exclude
    // any values that have a score less then 0.5.
    let regexMatch = { $match: { score: { $gt: 0.5 } } };

    let regex = { $regex:'(?:^|(?<= ))(' + searchTerm + ')(?:(?= )|$)', $options:'i' };

    if (schemaName === constants.PROJECT) {
      regexMatch.$match.name = regex;
    } else if (schemaName === constants.DOCUMENT) {
      regexMatch.$match.displayName = regex;
    }

    keywordRegexFilter.push(regexMatch);
  }

  return keywordRegexFilter;
};


exports.createResultAggregator = function () {
  return [
    {
      $facet: {
        searchResults: [{
          $match: {}
        }],
        meta: [
          { $limit: 1 },
          {
            $addFields: {
              "searchResultsTotal": "$totalCount"
            }
          },
          { $project: { "searchResultsTotal": 1, "_id": 0 } }
        ]
      }
    }
  ];
};
