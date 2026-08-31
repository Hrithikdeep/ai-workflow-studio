import { Global, Module } from '@nestjs/common';

import { CryptoService } from './crypto.service';

/**
 * Provides {@link CryptoService} application-wide.
 *
 * `CryptoService` reads its Base64 key from `APP_ENCRYPTION_KEY` (see the
 * service for validation rules). Registering this module has no runtime
 * side effects on its own — the key is only read/validated when the
 * service is first used.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
