export type CreateVariableDto = {
  name: string;
  value: string;
  type: 'String' | 'Number' | 'Boolean' | 'Secret';
  environment?: string;
};
