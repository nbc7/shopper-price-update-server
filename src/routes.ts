import { FastifyInstance } from 'fastify';
import mysql from 'mysql2';
import { z } from 'zod';

import { connection } from './config/mysqlConnectionInfo';

export async function routes(app: FastifyInstance) {
  app.get('/products', (_, reply) => {
    const db = mysql.createConnection(connection);

    db.connect((error) => {
      if (error) throw error;
      console.log('Connected to MySQL database!');
    });

    db.query('SELECT * FROM products', (error, result) => {
      if (error) throw error;
      reply.status(200).send(result);
      db.end();
    });
  });
}
