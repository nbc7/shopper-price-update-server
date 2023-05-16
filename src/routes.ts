import { FastifyInstance, FastifyRequest } from 'fastify';
import mysql from 'mysql2';
import { z } from 'zod';

import { connection } from './config/mysqlConnectionInfo';

interface Product {
  code: number;
  name: string;
  cost_price: string;
  sales_price: string;
  new_price?: number;
}

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

  app.post('/validate', async (req: FastifyRequest<{ Body: { csvData: { code: any; new_price: any }[] } }>, reply) => {
    const { csvData } = req.body;

    const db = mysql.createConnection(connection);

    db.connect((error) => {
      if (error) throw error;
    });

    const productsData: any = await new Promise((resolve) => {
      db.query('SELECT * FROM products', (error, result) => {
        if (error) throw error;
        resolve(result);
      });
    });

    db.end();

    const productCodeSchema = z.object({
      code: z.number().int().positive(),
    });

    const newPriceSchema = z.object({
      new_price: z.number().positive(),
    });

    const productCodeSet = new Set();

    let errorList: { index: number; field: string; message: string }[] = [];
    let productChanges: any = [];

    for (let i = 0; i < csvData.length; i++) {
      const data = csvData[i];

      let product: Product | undefined = undefined;
      let productCodeExists = false;

      if (productCodeSet.has(data.code)) {
        errorList.push({
          index: i,
          field: 'productCode',
          message: 'O código de produto foi repetido.',
        });
      }

      productCodeSet.add(data.code);

      try {
        const { code: productCode } = productCodeSchema.parse(data);

        product = productsData.find((product: Product) => product.code === productCode);
        productCodeExists = product !== undefined;

        if (!productCodeExists) {
          errorList.push({
            index: i,
            field: 'productCode',
            message: 'O código de produto não existe.',
          });
        }
      } catch (error: any) {
        const zodError = error.errors;

        zodError.map((error: any) => {
          errorList.push({
            index: i,
            field: error.path[0],
            message: `O código de produto esperava ${error.expected !== undefined ? error.expected : 'positive'}, recebeu ${
              error.received !== undefined ? error.received : 'negative'
            }.`,
          });
        });
      }

      try {
        const { new_price: newPrice } = newPriceSchema.parse(data);
      } catch (error: any) {
        const zodError = error.errors;

        zodError.map((error: any) => {
          errorList.push({
            index: i,
            field: error.path[0],
            message: `O novo preço esperava ${error.expected !== undefined ? error.expected : 'positive'}, recebeu ${
              error.received !== undefined ? error.received : 'negative'
            }.`,
          });
        });
      }

      productChanges.push({
        ...{ code: data.code, new_price: data.new_price },
        ...(productCodeExists
          ? { name: product?.name, sales_price: product?.sales_price, cost_price: product?.cost_price }
          : { name: null, sales_price: null, cost_price: null }),
      });
    }

    return reply.status(200).send({ productChanges, errorList });
  });
}
