import { factory } from '@types/factory-girl';
import Project from '../../helpers/models/project';

factory.define('project', Project, {});

const _factory = factory;
export { _factory as factory };