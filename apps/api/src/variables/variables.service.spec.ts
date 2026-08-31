import { VariablesService } from './variables.service';

describe('VariablesService', () => {
  it('returns an empty list when the variable schema is incompatible with Prisma', async () => {
    const prisma = {
      variable: {
        findMany: jest.fn().mockRejectedValue({
          code: 'P2032',
          message:
            'Error converting field "type" of expected non-nullable type "String", found incompatible value of "String".',
        }),
      },
    } as any;

    const service = new VariablesService(prisma);

    await expect(service.list(undefined, {})).resolves.toEqual([]);
  });
});
