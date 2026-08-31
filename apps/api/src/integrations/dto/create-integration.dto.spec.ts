import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateIntegrationDto } from './create-integration.dto';
import { SUPPORTED_PROVIDERS } from '../integration-providers';

/**
 * Guards the `POST /integrations` provider allow-list against ever drifting
 * away from the canonical `SUPPORTED_PROVIDERS` registry again.
 */
function providerErrors(provider: string) {
  const dto = plainToInstance(CreateIntegrationDto, { provider });
  return validateSync(dto).filter((e) => e.property === 'provider');
}

describe('CreateIntegrationDto.provider validation', () => {
  it('accepts "openai" (already in the canonical registry)', () => {
    expect(providerErrors('openai')).toHaveLength(0);
  });

  it('accepts every provider in SUPPORTED_PROVIDERS', () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(providerErrors(provider)).toHaveLength(0);
    }
  });

  it('still rejects a provider that is not registered', () => {
    const errs = providerErrors('ftp');
    expect(errs).toHaveLength(1);
    expect(Object.values(errs[0].constraints ?? {}).join(' ')).toContain(
      'openai',
    );
  });
});
