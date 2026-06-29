'use strict';

/**
 * swagger-router.js
 *
 * Replaces swagger-tools' swaggerMetadata + swaggerRouter middleware.
 *
 * Reads the Swagger 2.0 spec and registers Express routes for every
 * path/method combination. Before invoking the controller it populates
 * req.swagger with the same shape controllers already depend on:
 *
 *   req.swagger.params[name].value   – path, query, body or file values
 *   req.swagger.operation            – raw operation object from spec
 *   req.swagger.apiPath              – swagger path template (/project/{projId})
 *   req.swagger.operationPath        – ['paths', '/project/{projId}', 'get']
 */

const fs                    = require('fs');
const path                  = require('path');
const express               = require('express');
const multer                = require('multer');
const buildSecurityMiddleware = require('./swagger-security');

/**
 * Convert a Swagger path template to an Express route pattern.
 * /project/{projId}/pin  →  /project/:projId/pin
 */
function toExpressPath(swaggerPath) {
  return swaggerPath.replace(/\{([^}]+)\}/g, ':$1');
}

/**
 * Load all controller modules from the given directories.
 * Returns a map of controller name → module.
 */
function loadControllers(dirs) {
  const controllers = {};
  for (const dir of dirs) {
    fs.readdirSync(dir).forEach(file => {
      if (file.endsWith('.js')) {
        const name = path.basename(file, '.js');
        controllers[name] = require(path.join(dir, file));
      }
    });
  }
  return controllers;
}

/**
 * Resolve a $ref to a top-level parameter definition.
 */
function resolveParam(p, globalParams) {
  if (p && p.$ref) {
    // $ref format: "#/parameters/tsCollection"
    const name = p.$ref.split('/').pop();
    return (globalParams && globalParams[name]) || p;
  }
  return p;
}

/**
 * Merge path-level and operation-level parameter definitions.
 * Operation params override path params with the same name+location.
 */
function mergeParams(pathParams, operationParams, globalParams) {
  const merged = (pathParams || []).map(p => resolveParam(p, globalParams));
  for (const raw of (operationParams || [])) {
    const p = resolveParam(raw, globalParams);
    const idx = merged.findIndex(x => x.name === p.name && x.in === p.in);
    if (idx >= 0) merged[idx] = p;
    else merged.push(p);
  }
  return merged;
}

/**
 * Coerce a raw string value to the type declared in the Swagger param spec.
 * This mirrors what swagger-tools did automatically for query/path params.
 */
function coerce(value, param) {
  if (value === undefined || value === null) return value;
  const { type, format } = param;
  if (type === 'integer' || type === 'number' || format === 'int32' || format === 'int64' || format === 'float' || format === 'double') {
    const n = Number(value);
    return isNaN(n) ? value : n;
  }
  if (type === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  if (type === 'array') {
    if (Array.isArray(value)) return value; // qs already parsed multi-value
    if (typeof value === 'string') {
      const collectionFormat = param.collectionFormat || 'csv';
      if (collectionFormat === 'csv') return value.split(',');
      if (collectionFormat === 'pipes') return value.split('|');
      if (collectionFormat === 'ssv') return value.split(' ');
    }
  }
  return value;
}

/**
 * Build the swagger-params middleware for a single operation.
 * Populates req.swagger so controllers and auth middleware can use it.
 */
function buildParamsMiddleware(swaggerPath, method, operation, paramDefs) {
  return function swaggerParams(req, res, next) {
    const params = {};

    for (const param of paramDefs) {
      const { name, in: location, type } = param;
      let value;

      switch (location) {
        case 'path':
          value = coerce(req.params[name], param);
          break;
        case 'query':
          value = coerce(req.query[name], param);
          break;
        case 'header':
          value = req.headers[name.toLowerCase()];
          break;
        case 'body':
          // Single body param — value is the whole request body
          value = req.body;
          break;
        case 'formData':
          if (type === 'file') {
            // Multer populates req.file (single) or req.files (array)
            value = req.file ||
              (req.files && req.files.find(f => f.fieldname === name)) ||
              undefined;
          } else {
            value = req.body ? req.body[name] : undefined;
          }
          break;
        default:
          value = undefined;
      }

      params[name] = { value };
    }

    req.swagger = {
      params,
      operation,
      apiPath:       swaggerPath,
      operationPath: ['paths', swaggerPath, method]
    };

    next();
  };
}


/**
 * createSwaggerRouter(spec, controllerDirs)
 *
 * @param {object} spec           – Parsed Swagger 2.0 spec object
 * @param {string[]} controllerDirs – Absolute paths to controller directories
 * @returns {express.Router}
 */
function createSwaggerRouter(spec, controllerDirs) {
  const router      = express.Router();
  const controllers = loadControllers(controllerDirs);
  const uploadDir   = process.env.UPLOAD_DIRECTORY || './uploads/';

  for (const [swaggerPath, pathItem] of Object.entries(spec.paths || {})) {
    const expressPath    = toExpressPath(swaggerPath);
    const controllerName = pathItem['x-swagger-router-controller'];
    const pathParams     = pathItem.parameters || [];

    const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const { operationId } = operation;
      const controller = controllers[controllerName];

      if (!controller || typeof controller[operationId] !== 'function') {
        // Controller or handler not found — skip silently (some paths are docs-only)
        continue;
      }

      const paramDefs = mergeParams(pathParams, operation.parameters, spec.parameters);

      // Detect file upload parameters
      const fileParams = paramDefs.filter(p => p.in === 'formData' && p.type === 'file');

      const middlewares = [];

      // --- Multer for multipart/form-data with file fields ---
      if (fileParams.length > 0) {
        const isPublic = swaggerPath.startsWith('/public');
        const limitSize = isPublic ? 10 * 1024 * 1024 : 3 * 1024 * 1024 * 1024; // 10MB public vs 3GB admin
        const upload = multer({
          storage: multer.memoryStorage(),
          limits: {
            fileSize: limitSize
          }
        });
        middlewares.push(
          fileParams.length === 1
            ? upload.single(fileParams[0].name)
            : upload.any()
        );
      }

      // --- Populate req.swagger ---
      middlewares.push(buildParamsMiddleware(swaggerPath, method, operation, paramDefs));

      // --- Security (must run after params so req.swagger is set) ---
      middlewares.push(buildSecurityMiddleware(operation));

      // --- Controller ---
      middlewares.push(controller[operationId].bind(controller));

      router[method](expressPath, ...middlewares);
    }
  }

  return router;
}

module.exports = createSwaggerRouter;
