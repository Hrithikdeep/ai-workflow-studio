import {
  resolveNodeConfig,
  resolveString,
  VariableResolutionError,
  type ResolverContext,
} from './variable-resolver';

function ctx(variables: Record<string, unknown>): ResolverContext {
  return {
    input: { customer: { name: 'Ada' }, list: ['x', 'y'] },
    variables,
    previous: { output: { config: { valNumber: 7 } } },
    workflow: { id: 'wf', versionId: 'v', variables: {} },
    execution: { id: 'exec', triggerType: 'MANUAL' },
  };
}

describe('variable-resolver', () => {
  it('1. single variable interpolation', () => {
    expect(resolveString('Hello {{ name }}', ctx({ name: 'Hrithik' }))).toBe(
      'Hello Hrithik',
    );
  });

  it('2. multiple variables in one string', () => {
    expect(
      resolveString(
        'Hello {{ first_name }} {{ last_name }}',
        ctx({ first_name: 'Hrithik', last_name: 'Sharma' }),
      ),
    ).toBe('Hello Hrithik Sharma');
  });

  it('3. repeated variable resolves every occurrence', () => {
    expect(
      resolveString('{{ name }} — welcome {{ name }}', ctx({ name: 'Ada' })),
    ).toBe('Ada — welcome Ada');
  });

  it('4. unknown variable throws VARIABLE_NOT_FOUND (no fake value)', () => {
    try {
      resolveString('Hello {{ does_not_exist }}', ctx({ name: 'x' }));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(VariableResolutionError);
      expect((error as VariableResolutionError).code).toBe('VARIABLE_NOT_FOUND');
      expect((error as VariableResolutionError).variableName).toBe(
        'does_not_exist',
      );
      // safe message: names the key, never a value
      expect((error as Error).message).toBe(
        'Missing workflow variable "does_not_exist".',
      );
    }
  });

  it('4b. unknown vars.NAME also throws VARIABLE_NOT_FOUND', () => {
    expect(() => resolveString('{{ vars.nope }}', ctx({}))).toThrow(
      VariableResolutionError,
    );
  });

  it('5. typed number: whole field preserves the number', () => {
    const out = resolveNodeConfig(
      { score: '{{ lead_score }}' },
      ctx({ lead_score: 42 }),
    ) as Record<string, unknown>;
    expect(out.score).toBe(42);
    expect(typeof out.score).toBe('number');
  });

  it('5b. typed number: interpolated becomes string', () => {
    expect(
      resolveString('Score: {{ lead_score }}', ctx({ lead_score: 42 })),
    ).toBe('Score: 42');
  });

  it('6. typed boolean: whole field preserves the boolean', () => {
    const out = resolveNodeConfig(
      { flag: '{{ enabled }}' },
      ctx({ enabled: true }),
    ) as Record<string, unknown>;
    expect(out.flag).toBe(true);
  });

  it('7. object-valued variable: whole field preserves the object', () => {
    const meta = { a: 1, b: [2, 3] };
    const out = resolveNodeConfig(
      { meta: '{{ payload }}' },
      ctx({ payload: meta }),
    ) as Record<string, unknown>;
    expect(out.meta).toEqual(meta);
  });

  it('8. nested object resolution', () => {
    const out = resolveNodeConfig(
      {
        message: 'Hello {{ name }}',
        metadata: { source: '{{ source }}', nested: { deep: '{{ name }}' } },
      },
      ctx({ name: 'Ada', source: 'api' }),
    );
    expect(out).toEqual({
      message: 'Hello Ada',
      metadata: { source: 'api', nested: { deep: 'Ada' } },
    });
  });

  it('9. array resolution', () => {
    const out = resolveNodeConfig(
      { items: ['{{ first_name }}', '{{ last_name }}', 'literal'] },
      ctx({ first_name: 'Hrithik', last_name: 'Sharma' }),
    ) as Record<string, unknown>;
    expect(out.items).toEqual(['Hrithik', 'Sharma', 'literal']);
  });

  it('10. does not mutate the original config', () => {
    const original = {
      message: 'Hello {{ name }}',
      metadata: { source: '{{ source }}' },
      items: ['{{ name }}'],
    };
    const snapshot = JSON.parse(JSON.stringify(original));
    const resolved = resolveNodeConfig(original, ctx({ name: 'Ada', source: 's' }));

    expect(original).toEqual(snapshot); // unchanged
    expect(resolved).not.toBe(original);
    expect((resolved as { metadata: unknown }).metadata).not.toBe(
      original.metadata,
    );
    expect((resolved as { items: unknown }).items).not.toBe(original.items);
  });

  it('keeps existing namespaces working (input / previous)', () => {
    expect(
      resolveString('{{ input.customer.name }} #{{ previous.output.config.valNumber }}', ctx({})),
    ).toBe('Ada #7');
    const whole = resolveNodeConfig({ n: '{{ previous.output.config.valNumber }}' }, ctx({})) as {
      n: unknown;
    };
    expect(whole.n).toBe(7);
  });

  it('a bare name never shadows a reserved namespace', () => {
    // `input` is reserved; a variable literally named "input" is not reachable bare
    expect(resolveString('{{ input.customer.name }}', ctx({ input: 'SHADOW' }))).toBe(
      'Ada',
    );
  });

  it('12. no variable leakage: error for missing var does not include other values', () => {
    try {
      resolveString('{{ missing }}', ctx({ secret_ish: 'TOP-SECRET', name: 'Ada' }));
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).not.toContain('TOP-SECRET');
      expect(msg).not.toContain('Ada');
    }
  });
});
