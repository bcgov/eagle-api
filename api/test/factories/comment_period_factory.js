//TODO: revise for EPIC
import { factory } from '@types/factory-girl';
import CommentPeriod from '../../helpers/models/commentperiod';

factory.define('commentperiod', CommentPeriod, buildOptions => {
  let attrs = {
    code: factory.seq('CommentPeriod.code', (n) => `comment-code-${n}`),
    comment: factory.chance('sentence'),
    name: factory.chance('name'),
    isDeleted: false,
    tags: [
      ['public'], ['sysadmin']
    ], 
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