function findObjectsByEnding(obj, ending, accumulator) {
  if (obj.hasOwnProperty('children') && ('HashedFolder' === obj.constructor.name)) {
    obj.children.forEach(function(child) {
      if ('HashedFolder' == child.constructor.name) accumulator.concat(findObjectsByEnding(child, ending, accumulator));
      if (('HashedFile' == child.constructor.name) && (child.name.endsWith(ending))) accumulator.push(child);
    });
  } else if (obj.hasOwnProperty('name') && ('HashedFile' === obj.constructor.name)) {
    if (obj.name.endsWith(ending)) accumulator.push(obj);
  }
  return accumulator;
}

exports.findObjectsByEnding = findObjectsByEnding;