//TODO: revise for EPIC
import { factory } from '@types/factory-girl';
import User from '../../helpers/models/user';

factory.define('user', User, {
  displayName: factory.chance('name'),
  firstName: factory.chance('name'),
  lastName: factory.chance('name'),
  username: factory.seq('User.username', (n) => `test-user-${n}`),
  password: 'V3ryS3cr3tPass',
  roles: [['public']]
});

const _factory = factory;
export { _factory as factory };