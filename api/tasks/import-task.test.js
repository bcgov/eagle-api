describe('import-task', () => {
  describe('protectedCreateTask', () => {
    let importTask;

    beforeEach(() => {
      // mock query-actions sendResponse to return whatever is passed to it
      const mockSendResponse = jest.fn(input => {
        return Promise.resolve(input);
      });
      const queryActions = require('../helpers/actions');
      queryActions.sendResponse = mockSendResponse;

      // require this AFTER its require-mocks have been setup
      importTask = require('./import-task');
    });

    it('throws an error if required task param is missing', async () => {
      const mockArgs = {
        swagger: {
          params: {
            auth_payload: {
              realm_access: {
                roles: 'sysadmin'
              }
            },
            task: null
          }
        }
      };

      const res = await importTask.protectedCreateTask(mockArgs, {});
      expect(res).toEqual({});
    });

    it('throws an error if required task.value param is missing', async () => {
      const mockArgs = {
        swagger: {
          params: {
            auth_payload: {
              realm_access: {
                roles: 'sysadmin'
              }
            },
            task: {
              value: null
            }
          }
        }
      };

      const res = await importTask.protectedCreateTask(mockArgs, {});
      expect(res).toEqual({});
    });

    it('throws an error if materializedViewSubset value is invalid', async () => {
      const mockArgs = {
        swagger: {
          params: {
            auth_payload: {
              realm_access: {
                roles: 'sysadmin'
              }
            },
            task: {
              value: {
                taskType: 'updateMaterializedView',
                materializedViewSubset: ''
              }
            }
          }
        }
      };

      const res = await importTask.protectedCreateTask(mockArgs, {});
      expect(res).toEqual({});
    });

    it('throws an error if required taskType param is missing', async () => {
      const mockArgs = {
        swagger: {
          params: {
            auth_payload: {
              realm_access: {
                roles: 'sysadmin'
              }
            },
            task: {
              value: {
                materializedViewSubset: 'default'
              }
            }
          }
        }
      };

      const res = await importTask.protectedCreateTask(mockArgs, {});
      expect(res).toEqual({});
    });
  });
});
