import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { assertUuid } from '../../common/validation';
import { MatchDetailResponseDto } from './dto/match-detail-response.dto';
import { MatchResponseDto } from './dto/match-response.dto';
import { MatchesService } from './matches.service';

@ApiTags('matches')
@Controller('/api/matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @ApiOkResponse({ type: [MatchResponseDto] })
  list() {
    return this.matchesService.list();
  }

  @Get('/:id')
  @ApiOkResponse({ type: MatchDetailResponseDto })
  detail(@Param('id') id: string) {
    assertUuid(id);
    return this.matchesService.detail(id);
  }
}
