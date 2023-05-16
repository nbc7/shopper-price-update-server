import Fastify from 'fastify';
import cors from '@fastify/cors';
import * as dotenv from 'dotenv';

import { routes } from './routes';

const app = Fastify();

dotenv.config();

app.register(cors, {
  origin: [`${process.env.CLIENT_BASE_URL || 'http://localhost:5173'}`],
  methods: 'GET,POST',
});

app.register(routes);

app
  .listen({
    port: process.env.PORT ? Number(process.env.PORT) : 8080,
    host: '0.0.0.0',
  })
  .then(() => {
    console.log('HTTP server running!');
  });
