//TODO: revise for EPIC
import { factory } from '@types/factory-girl';
import { faker } from 'faker';
import Comment from '../../helpers/models/comment';

factory.define('comment', Comment, buildOptions => {
  let attrs = {
    code: factory.seq('Comment.code', (n) => `comment-code-${n}`),
    comment: factory.chance('sentence'),
    name: factory.chance('name'),
    isDeleted: false,
    tags: [
      ['public'], ['sysadmin']
    ], 
  }
  if (buildOptions.public) { 
    attrs.tags = [['public'], ['sysadmin']];
  } else if (buildOptions.public === false) {
    attrs.tags = [['sysadmin']];
  }
  return attrs;
});

const _factory = factory;
export { _factory as factory };