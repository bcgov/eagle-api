const defaultLog = require('winston').loggers.get('default');
const Actions    = require('../helpers/actions');
const projectDAO = require('../dao/projectDAO');
const documentDAO = require('../dao/documentDAO');
const constants  = require('../helpers/constants');

async function getDocuments(roles, params)
{
    let pageNumber = params.hasOwnProperty('pageNumber') && params.pageNumber.value ? params.pageNumber.value : 1;
    let pageSize   = params.hasOwnProperty('pageSize')   && params.pageSize.value   ? params.pageSize.value   : 10;
    let sortBy     = params.hasOwnProperty('sortBy')     && params.sortBy.value     ? params.sortBy.value     : '';
    let query      = params.hasOwnProperty('query')      && params.query.value      ? params.query.value      : '';
    let keywords   = params.hasOwnProperty('keywords')   && params.keywords.value   ? params.keywords.value   : '';
    let projects   = params.hasOwnProperty('projects')   && params.projects.value   ? params.projects.value   : [];
    let comments   = params.hasOwnProperty('comments')   && params.comments.value   ? params.comments.value   : [];

    let documents = await documentDAO.fetchDocuments(pageNumber, pageSize, sortBy, query, keywords, projects, comments, roles);

    for (let documentIdx in documents[0].searchResults)
    {
        let document = documents[0].searchResults[documentIdx];
        document = documentDAO.documentHateoas(document, roles);
    }

    return documents;
}

exports.documentOptions = function (args, res, next)
{
    res.status(200).send();
};

exports.documentOptionsProtected = function (args, res, next)
{
    res.status(200).send();
};

// POST (Secure, createDocument)
exports.createDocumentSecure = async function (args, res, next)
{
    defaultLog.debug('>>> {POST}/Documents');

    try
    {
        if (args.swagger.params.hasOwnProperty('upfile'))
        {
            let projecId = args.swagger.params.project ? args.swagger.params.project.value : null;
            let comment = args.swagger.params.comment ? args.swagger.params.comment.value : null;
            let userName = args.swagger.params.auth_payload.preferred_username ? args.swagger.params.auth_payload.preferred_username : 'public';
            let uploadedFile = args.swagger.params.upfile.value;
            
            let documentDetails = 
            {
                originalName       : args.swagger.params.internalOriginalName ? args.swagger.params.internalOriginalName.value : '',
                fileName           : args.swagger.params.documentFileName ? args.swagger.params.documentFileName.value : originalName,
                displayName        : args.swagger.params.displayName ? args.swagger.params.displayName.value : fileName,
                legislation        : args.swagger.params.legislation ? args.swagger.params.legislation.value : null,
                documentSource     : args.swagger.params.documentSource ? args.swagger.params.documentSource.value : null,
                eaoStatus          : args.swagger.params.eaoStatus ? args.swagger.params.eaoStatus.value : null,
                publish            : args.swagger.params.publish ? args.swagger.params.publish.value : false,
                milestone          : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.milestone.value) : null,
                type               : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.type.value) : null,
                documentAuthor     : args.swagger.params.projectPhase ? args.swagger.params.documentAuthor.value : null,
                documentAuthorType : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.documentAuthorType.value) : null,
                dateUploaded       : args.swagger.params.dateUploaded.value ? args.swagger.params.dateUploaded.value : null,
                datePosted         : args.swagger.params.datePosted.value ? args.swagger.params.datePosted.value : null,
                description        : args.swagger.params.description ? args.swagger.params.datePosted.value : null,
                projectPhase       : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.projectPhase.value) : null
            }

            let document = await documentDAO.createDocument(userName, projecId, comment, uploadedFile, documentDetails);
            document = documentDAO.documentHateoas(document, constants.SECURE_ROLES);
            
            return Actions.sendResponseV2(res, 201, document);
        }
        else
        {
            return Actions.sendResponseV2(res, 404, { code: 404, message: 'Document could not be created. No file was supplied'});
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {POST}/Documents :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST}/Documents');
    }
};

// GET (Secure, fetchDocumentsSecure)
exports.fetchDocumentsSecure = async function (args, res, next)
{
    defaultLog.debug('>>> {GET}/Documents');

    try
    {
        let documents = await getDocuments(constants.SECURE_ROLES, args.swagger.params);
        return Actions.sendResponseV2(res, 200, documents);
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Documents :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Documents');
    }
};

// GET (Secure, fetchDocumentSecure)
exports.fetchDocumentSecure = async function (args, res, next)
{
    defaultLog.debug('>>> {GET}/Documents/{id}');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let documentId = args.swagger.params.docId.value;

            let document = await documentDAO.fetchDocument(documentId);
            document = documentDAO.documentHateoas(document, constants.SECURE_ROLES);

            return Actions.sendResponseV2(res, 200, documents);
        }
        else
        {
          throw Error('Invalid request.');
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Documents/{id} :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Documents/{id}');
    }
};

// PUT (Secure, updateDocument)
exports.updateDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Documents/{id}');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId') && args.swagger.params.hasOwnProperty('upfile'))
        {
            let documentId = args.swagger.params.docId.value;
            let uploadedFile = args.swagger.params.upfile.value;
            let userName = args.swagger.params.auth_payload.preferred_username ? args.swagger.params.auth_payload.preferred_username : 'public';
            let projectId = args.swagger.params.project ? args.swagger.params.project.value : null;

            let documentDetails = 
            {
                type               : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.type.value) : null,
                documentSource     : args.swagger.params.documentSource ? args.swagger.params.documentSource.value : null,
                documentAuthor     : args.swagger.params.projectPhase ? args.swagger.params.documentAuthor.value : null,
                documentAuthorType : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.documentAuthorType.value) : null,
                milestone          : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.milestone.value) : null,
                projectPhase       : args.swagger.params.projectPhase ? mongoose.Types.ObjectId(args.swagger.params.projectPhase.value) : null,
                datePosted         : args.swagger.params.datePosted.value ? args.swagger.params.datePosted.value : null,
                dateUploaded       : args.swagger.params.dateUploaded.value ? args.swagger.params.dateUploaded.value : null,
                documentName       : args.swagger.params.documentName ? args.swagger.params.documentName.value : null,
                description        : args.swagger.params.description ? args.swagger.params.datePosted.value : null,
                keywords           : args.swagger.params.keywords ? args.swagger.params.keywords.value : null,
                labels             : args.swagger.params.labels ? args.swagger.params.labels.value : null,
                displayName        : args.swagger.params.displayName ? args.swagger.params.displayName.value : '',
                documentFileName   : args.swagger.params.documentFileName ? args.swagger.params.documentFileName.value : '',
                eaoStatus          : args.swagger.params.eaoStatus ? args.swagger.params.eaoStatus.value : null,
                legislation        : args.swagger.params.legislation ? args.swagger.params.legislation.value : null
            }

            let originalDocument = await documentDAO.fetchDocument(documentId);
            let updatedDocument = await documentDAO.updateDocument(userName, originalDocument, projectId, uploadedFile, documentDetails);
            updatedDocument = documentDAO.documentHateoas(updatedDocument, constants.SECURE_ROLES);
            
            return Actions.sendResponseV2(res, 200, document);
        }
        else
        {
            return Actions.sendResponseV2(res, 404, { code: 404, message: 'Document could not be updated. No file was supplied'});
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {PUT}/Documents/{id} :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Documents/{id}');
    }
};

// DELETE (Secure, deleteDocument)
exports.deleteDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {DELETE}/Documents/{id}');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let documentId = args.swagger.params.docId.value;
            let userName = args.swagger.params.auth_payload.preferred_username ? args.swagger.params.auth_payload.preferred_username : 'public';

            let document = await documentDAO.fetchDocument(documentId);
            document = await documentDAO.deleteDocument(userName, document);
            
            return Actions.sendResponseV2(res, 200, document);
        }
        else
        {
            return Actions.sendResponseV2(res, 404, { code: 404, message: 'Document could not be deleted. ID was not found'});
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {DELETE}/Documents/{id} :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE}/Documents/{id}');
    }
};

// PUT (Secure, publishDocument)
exports.publishDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Documents/{id}/Publish');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let documentId = args.swagger.params.docId.value;
            let userName = args.swagger.params.auth_payload.preferred_username ? args.swagger.params.auth_payload.preferred_username : 'public';

            let document = await documentDAO.fetchDocument(documentId);
            document = await documentDAO.publishDocument(userName, document);
            document = documentDAO.documentHateoas(updatedDocument, constants.SECURE_ROLES);

            return Actions.sendResponseV2(res, 200, document);
        }
        else
        {
            return Actions.sendResponseV2(res, 404, { code: 404, message: 'Document could not be published. ID was not found'});
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {PUT}/Documents/{id}/Publish :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}/Publish' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Documents/{id}/Publish');
    }
};

// PUT (Secure, unPublishDocument)
exports.unPublishDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Documents/{id}/Unpublish');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let documentId = args.swagger.params.docId.value;
            let userName = args.swagger.params.auth_payload.preferred_username ? args.swagger.params.auth_payload.preferred_username : 'public';

            let document = await documentDAO.fetchDocument(documentId);
            document = await documentDAO.unPublishDocument(userName, document);
            document = documentDAO.documentHateoas(updatedDocument, constants.SECURE_ROLES);

            return Actions.sendResponseV2(res, 200, document);
        }
        else
        {
            return Actions.sendResponseV2(res, 404, { code: 404, message: 'Document could not be un-published. ID was not found'});
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {PUT}/Documents/{id}/Unpublish :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}/Unpublish' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Documents/{id}/Unpublish');
    }
};

// PUT (Secure, featureDocument)
exports.featureDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Documents/{id}/Feature');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let documentId = args.swagger.params.docId.value;

            let document = await documentDAO.fetchDocument(documentId);
            let project = await projectDAO.getProject(document.project);

            if (document && project)
            {
                document = await documentDAO.featureDocument(document, project);

                if(document.isFeatured)
                {
                    document = documentDAO.documentHateoas(updatedDocument, constants.SECURE_ROLES);
                    return Actions.sendResponseV2(res, 200, document);
                }
                else
                {
                    Actions.sendResponseV2(res, 403, { status: 403, message: 'Feature document limit reached', limit: constants.MAX_FEATURE_DOCS});
                }
            }
            else
            {
                throw Error('Document does not have a project reference');
            }
        }
        else
        {
            return Actions.sendResponseV2(res, 404, { code: 404, message: 'Document could not be featured. ID was not found'});
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {PUT}/Documents/{id}/Feature :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}/Feature' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Documents/{id}/Feature');
    }
};

// PUT (Secure, unfeatureDocument)
exports.unfeatureDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Documents/{id}/Unfeature');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let documentId = args.swagger.params.docId.value;
            let document = await documentDAO.fetchDocument(documentId);

            if (document)
            {
                document = await documentDAO.unfeatureDocument(document);

                if(!document.isFeatured)
                {
                    document = documentDAO.documentHateoas(updatedDocument, constants.SECURE_ROLES);
                    return Actions.sendResponseV2(res, 200, document);
                }
                else
                {
                    throw Error('Could not un-feature document');
                }
            }
            else
            {
                throw Error('Document does not have a project reference');
            }
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {PUT}/Documents/{id}/Unfeature :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}/Unfeature' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Documents/{id}/Unfeature');
    }
};

// GET (Secure, downloadDocument)
exports.downloadDocumentSecure = function(args, res, next)
{
    defaultLog.debug('>>> {GET}/Documents/{id}/Download');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let userName = args.swagger.params.auth_payload.preferred_username;
            let documentId = args.swagger.params.docId.value;
            let document = await documentDAO.fetchDocument(documentId);
            let fileNameOverride = args.swagger.params.hasOwnProperty('fileName') && args.swagger.params.fileName.value ? args.swagger.params.fileName.value : null;

            if (document)
            {
                let documentMeta = await documentDAO.downloadDocumentGetMeta(constants.SECURE_ROLES, userName, document, fileNameOverride);

                res.setHeader('Content-Length', documentMeta.size);
                res.setHeader('Content-Type', documentMeta.metaData['content-type']);
                res.setHeader('Content-Disposition', 'attachment;filename="' + documentMeta.fileName + '"');

                return rp(documentMeta.url).pipe(res);
            }
            else
            {
                throw Error('Document does not have a project reference');
            }
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Documents/{id}/Download :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Documents/{id}/Download' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Documents/{id}/Download');
    }
};

// POST (Public, createDocument)
exports.createDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {POST}/Public/Documents');

    try
    {
        if (args.swagger.params.hasOwnProperty('upfile'))
        {
            let projecId = args.swagger.params.project ? args.swagger.params.project.value : null;
            let comment = args.swagger.params.comment ? args.swagger.params.comment.value : null;
            let userName = 'public';
            let uploadedFile = args.swagger.params.upfile.value;
            
            let documentDetails = 
            {
                displayName        : args.swagger.params.displayName ? args.swagger.params.displayName.value : fileName,
                documentAuthor     : args.body.documentAuthor,
                documentAuthorType : mongoose.Types.ObjectId(args.body.documentAuthorType),
                originalName       : uploadedFile.originalname,
                documentSource     : 'COMMENT'
            }

            let document = await documentDAO.createDocument(userName, projecId, comment, uploadedFile, documentDetails);
            document = documentDAO.documentHateoas(document, constants.PUBLIC_ROLES);
            
            return Actions.sendResponseV2(res, 201, document);
        }
        else
        {
            return Actions.sendResponseV2(res, 404, { code: 404, message: 'Document could not be created. No file was supplied'});
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {POST}/Public/Documents :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Documents' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST}/Public/Documents');
    }
};

// GET (Public, fetchDocumentsSecure)
exports.fetchDocuments = async function (args, res, next)
{
    defaultLog.debug('>>> {GET}/Public/Documents');

    try
    {
        let documents = await getDocuments(constants.PUBLIC_ROLES, args.swagger.params);
        return Actions.sendResponseV2(res, 200, documents);
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Public/Documents :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Documents' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Public/Documents');
    }
};

// GET (Public, fetchDocument)
exports.fetchDocument = async function (args, res, next)
{
    defaultLog.debug('>>> {GET}/Public/Documents/{id}');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let documentId = args.swagger.params.docId.value;

            let document = await documentDAO.fetchDocument(documentId);
            document = documentDAO.documentHateoas(document, constants.PUBLIC_ROLES);

            return Actions.sendResponseV2(res, 200, documents);
        }
        else
        {
          throw Error('Invalid request.');
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Public/Documents/{id} :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Documents/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Public/Documents/{id}');
    }
};

// GET (Public, downloadDocument)
exports.downloadDocument = function(args, res, next)
{
    defaultLog.debug('>>> {GET}/Public/Documents/{id}/Download');

    try
    {
        if (args.swagger.params.hasOwnProperty('docId'))
        {
            let userName = args.swagger.params.auth_payload ? rgs.swagger.params.auth_payload.preferred_username : 'public';
            let documentId = args.swagger.params.docId.value;
            let document = await documentDAO.fetchDocument(documentId);
            let fileNameOverride = args.swagger.params.hasOwnProperty('fileName') && args.swagger.params.fileName.value ? args.swagger.params.fileName.value : null;

            if (document)
            {
                let documentMeta = await documentDAO.downloadDocumentGetMeta(constants.PUBLIC_ROLES, userName, document, fileNameOverride);

                res.setHeader('Content-Length', documentMeta.size);
                res.setHeader('Content-Type', documentMeta.metaData['content-type']);
                res.setHeader('Content-Disposition', 'attachment;filename="' + documentMeta.fileName + '"');

                return rp(documentMeta.url).pipe(res);
            }
            else
            {
                throw Error('Document does not have a project reference');
            }
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Public/Documents/{id}/Download :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Documents/{id}/Download' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Public/Documents/{id}/Download');
    }
};