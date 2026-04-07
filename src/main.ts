import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'https://www.nfl-ga.com',
      'https://nfl-courtier.vercel.app',
      'https://nfl-ga.vercel.app',
      /\.vercel\.app$/,
      /localhost:\d+$/,
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('NFL Courtier & Service — API')
    .setDescription(
      `Documentation complète de l'API backend de NFL Courtier & Service.
      
## Modules disponibles
- **Events** : Gestion des événements (CRUD)
- **Tickets** : Réservation, génération PDF & envoi par email
- **Newsletter** : Abonnements newsletter
- **Auth** : Authentification administrateur

## Authentication
Les routes protégées nécessitent un **Bearer Token JWT**.
Utilisez \`POST /api/auth/login\` pour obtenir votre token.`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentification administrateur')
    .addTag('Events', 'Gestion des événements')
    .addTag('Tickets', 'Réservation et gestion des tickets')
    .addTag('Newsletter', 'Gestion des abonnés newsletter')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'NFL API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 NFL Backend running on port ${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
