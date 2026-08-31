export type UpdateVariableDto = {
  name?: string;
  value?: string;
  type?: 'String' | 'Number' | 'Boolean' | 'Secret';
  environment?: string;
};
