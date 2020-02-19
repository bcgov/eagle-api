// Imports
const defaultLog = require('winston').loggers.get('default');
const Actions    = require('../helpers/actions');

// Constants
/* put any needed const variables here */
// Vars
/* put any needed local variables here */
// functions
/* put any needed local functions here */
// Exports

// OPTIONS
exports.topLevelOptions = function (args, res, rest) 
{
  res.status(200).send();
};

// GET (Public, getPin)
exports.getTopLevel = async function (args, res, next)
{
    defaultLog.debug('>>> {GET} /');

    try
    {
        let topLevelData =
        {
            title: 'EPIC API v2',
            description: 'The EPIC application RESTful service, for accessing EPIC projects and documents',
            version: '1.0.0',
            links:
            [
                { rel: 'self', title: 'API Top Level', method: 'GET', href: '/api/v2/' },
                { rel: 'fetch', title: 'Public Projects List', method: 'GET', href: '/api/v2/Public/Projects' },
            ]
        };

        // secure links
        if (args.swagger.params.hasOwnProperty('auth_payload') && args.swagger.params.auth_payload.preferred_username !== 'public')
        {
            topLevelData.links.push({ rel: 'fetch', title: 'Secure Projects List', method: 'GET', href: '/api/v2/Projects' });
            topLevelData.links.push({ rel: 'create', title: 'Secure Projects Create', method: 'POST', href: '/api/v2/Projects' });
            
            /* Endpoints without a bindable link (we don't return PIN or MEMBER(user) resources yet)
            topLevelData.links.push({ name: 'Secure Project Pins Delete', type: 'DELETE', uri: '/api/v2/Projects/{id}/Pins/{id}' });
            topLevelData.links.push({ name: 'Secure Project Delete Group Member', type: 'DELETE', uri: '/api/v2/Projects/Groups/{id}/Members/{id}' });*/
        }

        Actions.sendResponseV2(res, 200, topLevelData);
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET} / :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/v2/' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET} /');
    }
};