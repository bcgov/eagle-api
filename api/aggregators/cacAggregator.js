const mongoose = require('mongoose');
const aggregateHelper = require('../helpers/aggregators');

/**
 * Creates aggregation required for CAC.
 * 
 * @returns {array} Aggregation
 */
 exports.createMatchAggr = async (schemaName, projectId, keywords, caseSensitive, orModifier, andModifier, roles) => {
  let aggregation = [];
  let projectModifier;
  let keywordModifier;

  console.log("------------------Project MOD:", projectId);
  console.log("------------------Project roles:", roles);

  // TODO: Find the project first, then iterate through the CAC members and populate them
  // checking if they have access to the project and they have the role to grab cacMembers


  if (projectId) {
    // If we are asked to filter based on project, we need to get the project first 
    // then populate the CACUser list accordingly.
    aggregation.push({
      $match: {
        _schemaName: 'Project',
        _id: mongoose.Types.ObjectId(projectId)
      },
    },
    {
      $lookup: {
        "from": "epic",
        "localField": "cacMembers",
        "foreignField": "_id",
        "as": "cacMembers"
      }
    },
    {
      "$unwind": {
        "path": "$cacMembers",
        "preserveNullAndEmptyArrays": true
      }
    },
    {
      $replaceRoot: {
        newRoot: {
          $cond: {
            if: '$cacMembers', then: '$cacMembers', else: {}
          }
        }
      }
    });
  }

  if (keywords) {
    // TODO: change this
    // keywordModifier = { $text: { $search: keywords, $caseSensitive: caseSensitive } };
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
    } 
  });

  aggregation.push(
    {
      $redact: {
        $cond: {
          if: {
            // This way, if read isn't present, we assume public no roles array.
            $and: [
              { $cond: { if: "$read", then: true, else: false } },
              {
                $anyElementTrue: {
                  $map: {
                    input: "$read",
                    as: "fieldTag",
                    in: { $setIsSubset: [["$$fieldTag"], roles] }
                  }
                }
              }
            ]
          },
          then: "$$KEEP",
          else: {
            $cond: { if: "$read", then: "$$PRUNE", else: "$$DESCEND" }
          }
        }
      }
    },
    {
      $addFields: {
        score: { $meta: "textScore" }
      }
    }
  );

  console.log("AGG:", JSON.stringify(aggregation));

  return aggregation;
};
