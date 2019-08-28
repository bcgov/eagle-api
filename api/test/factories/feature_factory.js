//TODO: revise for EPIC
import { factory } from '@types/factory-girl';
import Feature from '../../helpers/models/feature';

factory.define('feature', Feature, {
  tags: [
    ['public'], ['sysadmin']
  ],
  properties: {
    TENURE_STATUS: 'ACCEPTED',
    TENURE_LOCATION: factory.chance('address'),
    DISPOSITION_TRANSACTION_SID: factory.chance('integer'),
  },
  isDeleted: false,
});

const _factory = factory;
export { _factory as factory };