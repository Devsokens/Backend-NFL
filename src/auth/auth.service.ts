import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../supabase.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const { data, error } = await this.supabase
      .getClient()
      .auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const payload = {
      sub: data.user.id,
      email: data.user.email,
      role: data.user.user_metadata?.role || 'admin',
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: data.user.id,
        email: data.user.email,
        role: payload.role,
      },
    };
  }

  async validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }
}
