import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Connexion administrateur',
    description: 'Authentifie un administrateur et retourne un JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Connexion réussie. Retourne un access_token JWT.',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: { id: 'uuid', email: 'admin@nfl-gabon.com', role: 'admin' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Identifiants invalides.' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
