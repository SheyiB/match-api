import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { assertUuid } from '../../common/validation';
import { ChatPresenceResponseDto } from './dto/chat-message.dto';
import { ChatService } from './chat.service';

@ApiTags('chat')
@Controller('/api/matches/:id/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('/presence')
  @ApiOkResponse({ type: ChatPresenceResponseDto })
  presence(@Param('id') id: string) {
    assertUuid(id);
    return this.chatService.presence(id);
  }
}
