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

interface Pack {
  id: number;
  pack_id: number;
  product_id: number;
  qty: number;
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

    const packsData: any = await new Promise((resolve) => {
      db.query('SELECT * FROM packs', (error, result) => {
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

        if (productCodeExists && product) {
          const productCostPrice = parseFloat(product.cost_price);
          const productSalesPrice = parseFloat(product.sales_price);

          const maxPercentage = 10;
          const maxPriceAdjustment = (productSalesPrice * maxPercentage) / 100;

          if (newPrice < productCostPrice) {
            errorList.push({
              index: i,
              field: 'newPrice',
              message: 'O novo preço não pode ser mais baixo que o custo.',
            });
          }

          if (newPrice > productSalesPrice + maxPriceAdjustment || newPrice < productSalesPrice - maxPriceAdjustment) {
            errorList.push({
              index: i,
              field: 'newPrice',
              message: `O novo preço não pode ter um reajuste maior ou menor que ${maxPercentage}% do preço atual.`,
            });
          }

          const pack = packsData.find((pack: Pack) => pack.pack_id === data.code);
          const packsWithProduct = packsData.filter((pack: Pack) => pack.product_id === product?.code);

          if (!pack && packsWithProduct.length > 0) {
            const packsWithProductId = packsWithProduct.map((pack: Pack) => pack.pack_id);
            const dataHasAllPacksWithProduct = packsWithProductId.every((pack: number) => csvData.some((data) => data.code === pack));

            if (!dataHasAllPacksWithProduct) {
              errorList.push({
                index: i,
                field: 'newPrice',
                message: 'O novo preço não pode ser reajustado sem reajustar o preço de pacotes que o produto faz parte.',
              });
            }
          }

          if (pack && pack.pack_id === product.code) {
            const productPacks = packsData.filter((pack: Pack) => pack.pack_id === product?.code);
            const packContents: Product[] = productPacks.map((pack: Pack) =>
              productCodeSet.has(pack.product_id)
                ? productChanges.find((change: Product) => change.code === pack.product_id)
                : productsData.find((product: Product) => product.code === pack.product_id)
            );

            const totalPrice: number = parseFloat(
              productPacks
                .reduce((accumulator: number, pack: Pack) => {
                  const product = packContents.find((product) => product.code === pack.product_id) as Product;
                  const price = product.new_price || parseFloat(product.sales_price);

                  return accumulator + price * pack.qty;
                }, 0)
                .toFixed(2)
            );

            if (newPrice !== totalPrice) {
              errorList.push({
                index: i,
                field: 'newPrice',
                message: 'O novo preço do pacote tem que ser igual ao preço da soma dos componentes do pacote.',
              });
            }
          }
        }
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
