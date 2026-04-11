'use strict';

const Typesense = require('typesense');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Typesense.Client({
      nodes: [{
        host:     process.env.TYPESENSE_HOST || 'localhost',
        port:     parseInt(process.env.TYPESENSE_PORT || '8108', 10),
        protocol: 'http',
      }],
      apiKey:                   process.env.TYPESENSE_API_KEY || 'local-dev-key',
      connectionTimeoutSeconds: 10,
      retryIntervalSeconds:     5,
      numRetries:               3,
    });
  }
  return _client;
}

module.exports = { getClient };
