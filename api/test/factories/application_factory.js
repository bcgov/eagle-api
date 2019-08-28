//TODO: revise for EPIC
import { factory } from '@types/factory-girl';
import Application from '../../helpers/models/application';

factory.define('application', Application, {
  code: factory.seq('Application.code', (n) => `app-code-${n}`),
  isDeleted: false,
  internal: {
    tags: [
      ['public'], ['sysadmin']
    ]  
  },
  name: factory.seq('Application.name', (n) => `application-${n}`),
  tags: [
    ['public'], ['sysadmin']
  ], 
});

const _factory = factory;
export { _factory as factory };