import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  public check(): { status: 'ok'; service: 'api' } {
    return {
      status: 'ok',
      service: 'api',
    };
  }
}
