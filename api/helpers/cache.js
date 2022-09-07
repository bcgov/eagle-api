const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300});

exports.set = function(key, obj, timeout = 300) {
    return cache.set(key,obj,timeout)
}

exports.get = function(key) {
    return cache.get(key);
}