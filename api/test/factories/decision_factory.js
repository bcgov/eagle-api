//TODO: revise for EPIC
import { factory } from '@types/factory-girl';
import Decision from '../../helpers/models/decision';

factory.define('decision', Decision, buildOptions => {
  let attrs = {
    code: factory.seq('Decision.code', (n) => `decision-code-${n}`),
    isDeleted: false,
    name: factory.seq('Decision.name', (n) => `decision-${n}`),
    tags: [
      ['public'], ['sysadmin']
    ]
  };
  if (buildOptions.public) { 
    attrs.tags = [['public'], ['sysadmin']];
  } else if (buildOptions.public === false) {
    attrs.tags = [['sysadmin']];
  }
  return attrs;
});

const _factory = factory;
export { _factory as factory };