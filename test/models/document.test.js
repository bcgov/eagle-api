/**
 * Unit Tests for Document Model Validation Gating
 */

const { expect } = require('chai');
const mongoose = require('mongoose');

// Register models
require('../../api/helpers/models/project');
const Document = require('../../api/helpers/models/document');

describe('Document Model Validation Gating', () => {
  
  it('should fail validation when parent project reference is missing', async () => {
    const doc = new Document({
      displayName: 'Unattached Document.pdf',
      documentFileName: 'unattached_document.pdf'
    });

    try {
      await doc.validate();
      throw new Error('Validation should have failed due to missing project reference');
    } catch (err) {
      expect(err).to.exist;
      expect(err.name).to.equal('ValidationError');
      expect(err.errors.project).to.exist;
      expect(err.errors.project.message).to.equal('A document must always belong to a valid project.');
    }
  });

  it('should fail validation when parent project reference is null', async () => {
    const doc = new Document({
      displayName: 'Null Project Document.pdf',
      documentFileName: 'null_project_document.pdf',
      project: null
    });

    try {
      await doc.validate();
      throw new Error('Validation should have failed due to null project reference');
    } catch (err) {
      expect(err).to.exist;
      expect(err.name).to.equal('ValidationError');
      expect(err.errors.project).to.exist;
      expect(err.errors.project.message).to.equal('A document must always belong to a valid project.');
    }
  });

  it('should pass validation when valid parent project reference is supplied', async () => {
    const validProjectId = new mongoose.Types.ObjectId();
    const doc = new Document({
      displayName: 'Valid Document.pdf',
      documentFileName: 'valid_document.pdf',
      project: validProjectId
    });

    // Should not throw validation error for project reference
    try {
      await doc.validate();
    } catch (err) {
      // If there are other validation errors we don't mind, but 'project' shouldn't be one
      if (err.errors && err.errors.project) {
        expect.fail('Project validation failed but valid ID was provided');
      }
    }
  });

  it('should pass validation for existing legacy documents even with null/missing project reference', async () => {
    const doc = new Document({
      displayName: 'Legacy Document.pdf',
      documentFileName: 'legacy_document.pdf',
      project: null
    });

    // Mock that document is already persisted/existing in database
    doc.isNew = false;

    try {
      await doc.validate();
    } catch (err) {
      if (err.errors && err.errors.project) {
        expect.fail('Validation failed for legacy document: existing records must bypass required project validation');
      }
    }
  });
});
