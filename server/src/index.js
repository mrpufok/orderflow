import 'dotenv/config';
import express from 'express';
import pg from 'pg';

// Настройки сервера и соединения с PostgreSQL.
const app = express();
app.use(express.json({ limit: '100kb' }));

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'orderflow_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => { throw new ApiError(status, message); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

function requiredText(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    fail(400, `Поле «${field}» должно содержать от 1 до ${maxLength} символов`);
  }
  return value.trim();
}

function optionalText(value, field, maxLength = 300) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    fail(400, `Некорректное поле «${field}»`);
  }
  return value.trim();
}

function nonnegativeInt(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    fail(400, `Поле «${field}» должно быть целым числом от 0 до 1000000`);
  }
  return value;
}

function positiveId(value, field) {
  if (!isId(value)) fail(400, `Некорректное поле «${field}»`);
  return Number(value);
}

// Денежные суммы в API принимаются в рублях, в БД хранятся в копейках.
function priceToCents(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
    fail(400, 'Цена должна быть положительным числом с максимум двумя знаками после запятой');
  }
  const [rubles, fraction = ''] = text.split('.');
  const cents = Number(rubles) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 2_147_483_647) {
    fail(400, 'Цена не поддерживается');
  }
  return cents;
}

function discountToHundredths(value = 0) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) {
    fail(400, 'Скидка должна быть числом от 0 до 100 с максимум двумя знаками после запятой');
  }
  const [whole, fraction = ''] = text.split('.');
  const value100 = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (value100 > 10000) fail(400, 'Скидка не может превышать 100%');
  return value100;
}

function productJson(row) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    price: row.priceCents / 100,
    stock: row.stock,
    // UnitsInOrder — количество единиц в заказах со статусом «Новый».
    unitsInOrder: row.unitsInOrder ?? 0,
  };
}

function validateProduct(body) {
  if (!isObject(body)) fail(400, 'Передай JSON-объект с данными товара');
  return {
    name: requiredText(body.name, 'Название товара'),
    categoryId: positiveId(body.categoryId, 'Категория'),
    priceCents: priceToCents(body.price),
    stock: nonnegativeInt(body.stock, 'Количество на складе'),
  };
}

function parseRowId(req) {
  return positiveId(req.params.id, 'ID');
}

// Проверка соединения с базой данных.
app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected', service: 'OrderFlow API' });
});

app.get('/api/categories', async (_req, res) => {
  const result = await pool.query('SELECT id, name, description FROM categories ORDER BY id');
  res.json(result.rows);
});

app.post('/api/categories', async (req, res) => {
  if (!isObject(req.body)) fail(400, 'Передай JSON-объект');
  const name = requiredText(req.body.name, 'Название категории', 100);
  const description = optionalText(req.body.description, 'Описание', 2000);
  const result = await pool.query(
    'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id, name, description',
    [name, description]
  );
  res.status(201).json(result.rows[0]);
});

// Изменение и удаление категорий. Категорию с товарами удалять нельзя.
app.put('/api/categories/:id', async (req, res) => {
  const id = parseRowId(req);
  if (!isObject(req.body)) fail(400, 'Передай JSON-объект');
  const name = requiredText(req.body.name, 'Название категории', 100);
  const description = optionalText(req.body.description, 'Описание', 2000);
  const result = await pool.query(
    'UPDATE categories SET name = $1, description = $2 WHERE id = $3 RETURNING id, name, description',
    [name, description, id]
  );
  if (result.rowCount === 0) fail(404, 'Категория не найдена');
  res.json(result.rows[0]);
});

app.delete('/api/categories/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [parseRowId(req)]);
  if (result.rowCount === 0) fail(404, 'Категория не найдена');
  res.json({ message: 'Категория удалена' });
});

app.get('/api/products', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 200) fail(400, 'Слишком длинная строка поиска');
  const categoryId = req.query.categoryId === undefined
    ? null : positiveId(req.query.categoryId, 'Категория');
  const result = await pool.query(`
    SELECT p.id, p.category_id AS "categoryId", p.name,
           p.price_cents AS "priceCents", p.stock,
           COALESCE((
             SELECT SUM(od.quantity)::integer
             FROM order_details od
             JOIN orders o ON o.id = od.order_id
             WHERE od.product_id = p.id AND o.status = 'Новый'
           ), 0) AS "unitsInOrder"
    FROM products p
    WHERE ($1::text = '' OR p.name ILIKE '%' || $1 || '%')
      AND ($2::integer IS NULL OR p.category_id = $2)
    ORDER BY p.id
  `, [search, categoryId]);
  res.json(result.rows.map(productJson));
});

app.post('/api/products', async (req, res) => {
  const item = validateProduct(req.body);
  const result = await pool.query(`
    INSERT INTO products (category_id, name, price_cents, stock)
    VALUES ($1, $2, $3, $4)
    RETURNING id, category_id AS "categoryId", name, price_cents AS "priceCents", stock
  `, [item.categoryId, item.name, item.priceCents, item.stock]);
  res.status(201).json(productJson(result.rows[0]));
});

app.put('/api/products/:id', async (req, res) => {
  const id = parseRowId(req);
  const item = validateProduct(req.body);
  const result = await pool.query(`
    UPDATE products SET category_id = $1, name = $2, price_cents = $3, stock = $4
    WHERE id = $5
    RETURNING id, category_id AS "categoryId", name, price_cents AS "priceCents", stock
  `, [item.categoryId, item.name, item.priceCents, item.stock, id]);
  if (result.rowCount === 0) fail(404, 'Товар не найден');
  res.json(productJson(result.rows[0]));
});

app.delete('/api/products/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [parseRowId(req)]);
  if (result.rowCount === 0) fail(404, 'Товар не найден');
  res.json({ message: 'Товар удалён' });
});

// История заказов вместе с составом каждой покупки.
app.get('/api/orders', async (_req, res) => {
  const orders = await pool.query(`
    SELECT id, customer, employee, order_date AS "orderDate",
           shipped_date AS "shippedDate", ship_name AS "shipName",
           ship_address AS "shipAddress", status, total_cents AS "totalCents"
    FROM orders ORDER BY id DESC
  `);
  const details = await pool.query(`
    SELECT order_id AS "orderId", product_id AS "productId", product_name AS "productName",
           quantity, unit_price_cents AS "unitPriceCents",
           discount_hundredths AS "discountHundredths", line_total_cents AS "lineTotalCents"
    FROM order_details ORDER BY order_id DESC, product_id
  `);
  const byOrderId = new Map();
  for (const detail of details.rows) {
    const list = byOrderId.get(detail.orderId) || [];
    list.push({
      productId: detail.productId,
      productName: detail.productName,
      quantity: detail.quantity,
      unitPriceCents: detail.unitPriceCents,
      discountPercent: detail.discountHundredths / 100,
      lineTotalCents: Number(detail.lineTotalCents),
    });
    byOrderId.set(detail.orderId, list);
  }
  res.json(orders.rows.map((order) => ({
    ...order,
    totalCents: Number(order.totalCents),
    details: byOrderId.get(order.id) || [],
  })));
});

// Все операции оформления заказа выполняются одной транзакцией.
// Проверка данных заказа одинакова для создания и редактирования.
function validateOrder(body) {
  if (!isObject(body)) fail(400, 'Передай JSON-объект заказа');
  const customer = requiredText(body.customer, 'Клиент');
  const employee = requiredText(body.employee, 'Сотрудник');
  const shipName = requiredText(body.shipName, 'Наименование магазина');
  const shipAddress = requiredText(body.shipAddress, 'Адрес магазина', 1000);
  const discount = discountToHundredths(body.discountPercent ?? 0);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    fail(400, 'Заказ должен содержать от 1 до 100 разных товаров');
  }
  const items = body.items.map((item) => {
    if (!isObject(item)) fail(400, 'Некорректная позиция заказа');
    const productId = positiveId(item.productId, 'ID товара');
    const quantity = nonnegativeInt(item.quantity, 'Количество');
    if (quantity === 0) fail(400, 'Количество в заказе должно быть больше нуля');
    return { productId, quantity };
  });
  if (new Set(items.map((item) => item.productId)).size !== items.length) {
    fail(400, 'Один товар нельзя передавать несколькими позициями');
  }
  items.sort((a, b) => a.productId - b.productId);
  return { customer, employee, shipName, shipAddress, discount, items };
}

// Итог позиции считается в целых копейках по цене на момент сохранения заказа.
function calcLineCents(priceCents, quantity, discount) {
  const result = (BigInt(priceCents) * BigInt(quantity) * BigInt(10000 - discount) + 5000n) / 10000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail(400, 'Слишком большая сумма заказа');
  return Number(result);
}

app.post('/api/orders', async (req, res) => {
  const { customer, employee, shipName, shipAddress, discount, items } = validateOrder(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lines = [];
    let totalCents = 0;
    for (const item of items) {
      // FOR UPDATE защищает остаток от одновременного списания двумя заказами.
      const result = await client.query(
        'SELECT id, name, price_cents, stock FROM products WHERE id = $1 FOR UPDATE',
        [item.productId]
      );
      if (result.rowCount === 0) fail(404, `Товар №${item.productId} не найден`);
      const product = result.rows[0];
      if (product.stock < item.quantity) {
        fail(409, `Товара «${product.name}» недостаточно на складе (осталось ${product.stock} шт.)`);
      }
      const lineTotalCents = calcLineCents(product.price_cents, item.quantity, discount);
      if (totalCents + lineTotalCents > Number.MAX_SAFE_INTEGER) fail(400, 'Слишком большая сумма заказа');
      totalCents += lineTotalCents;
      lines.push({ ...item, product, lineTotalCents });
    }

    const insertOrder = await client.query(`
      INSERT INTO orders (customer, employee, ship_name, ship_address, total_cents)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [customer, employee, shipName, shipAddress, totalCents]);
    const orderId = insertOrder.rows[0].id;

    for (const line of lines) {
      await client.query(`
        INSERT INTO order_details
          (order_id, product_id, product_name, quantity, unit_price_cents,
           discount_hundredths, line_total_cents)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [orderId, line.productId, line.product.name, line.quantity,
          line.product.price_cents, discount, line.lineTotalCents]);
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2',
        [line.quantity, line.productId]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: orderId, status: 'Новый', totalCents });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Изменять состав можно только у нового заказа: отгруженный заказ фиксирует совершённую продажу.
// При редактировании прежние количества возвращаются в расчёт доступного остатка.
app.put('/api/orders/:id', async (req, res) => {
  const orderId = parseRowId(req);
  const input = validateOrder(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (existing.rowCount === 0) fail(404, 'Заказ не найден');
    if (existing.rows[0].status !== 'Новый') fail(409, 'Отгруженный заказ нельзя изменить');

    const oldDetails = await client.query(
      'SELECT product_id, quantity FROM order_details WHERE order_id = $1 ORDER BY product_id', [orderId]
    );
    const oldQty = new Map(oldDetails.rows.map((row) => [row.product_id, row.quantity]));
    const productIds = [...new Set([...oldQty.keys(), ...input.items.map((x) => x.productId)])].sort((a, b) => a - b);
    const locked = await client.query(
      'SELECT id, name, price_cents, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
      [productIds]
    );
    const byId = new Map(locked.rows.map((row) => [row.id, row]));
    let totalCents = 0;
    const lines = [];
    for (const item of input.items) {
      const product = byId.get(item.productId);
      if (!product) fail(404, `Товар №${item.productId} не найден`);
      if (item.quantity > product.stock + (oldQty.get(item.productId) || 0)) {
        fail(409, `Товара «${product.name}» недостаточно на складе`);
      }
      const lineTotalCents = calcLineCents(product.price_cents, item.quantity, input.discount);
      if (totalCents + lineTotalCents > Number.MAX_SAFE_INTEGER) fail(400, 'Слишком большая сумма заказа');
      totalCents += lineTotalCents;
      lines.push({ ...item, product, lineTotalCents });
    }

    await client.query('DELETE FROM order_details WHERE order_id = $1', [orderId]);
    for (const productId of productIds) {
      const newQty = input.items.find((item) => item.productId === productId)?.quantity || 0;
      const adjustment = (oldQty.get(productId) || 0) - newQty;
      if (adjustment !== 0) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [adjustment, productId]);
      }
    }
    for (const line of lines) {
      await client.query(`
        INSERT INTO order_details
          (order_id, product_id, product_name, quantity, unit_price_cents,
           discount_hundredths, line_total_cents)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [orderId, line.productId, line.product.name, line.quantity,
          line.product.price_cents, input.discount, line.lineTotalCents]);
    }
    await client.query(`
      UPDATE orders SET customer = $1, employee = $2, ship_name = $3,
        ship_address = $4, total_cents = $5 WHERE id = $6
    `, [input.customer, input.employee, input.shipName, input.shipAddress, totalCents, orderId]);
    await client.query('COMMIT');
    res.json({ id: orderId, status: 'Новый', totalCents });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Удаление нового заказа освобождает списанные остатки.
// Удаление отгруженного не возвращает товар на склад, потому что он уже продан.
app.delete('/api/orders/:id', async (req, res) => {
  const orderId = parseRowId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (existing.rowCount === 0) fail(404, 'Заказ не найден');
    if (existing.rows[0].status === 'Новый') {
      const details = await client.query(
        'SELECT product_id, quantity FROM order_details WHERE order_id = $1 ORDER BY product_id', [orderId]
      );
      for (const detail of details.rows) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2',
          [detail.quantity, detail.product_id]);
      }
    }
    await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
    await client.query('COMMIT');
    res.json({ message: 'Заказ удалён' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.patch('/api/orders/:id/ship', async (req, res) => {
  const id = parseRowId(req);
  const result = await pool.query(`
    UPDATE orders SET status = 'Отгружен', shipped_date = NOW()
    WHERE id = $1 AND status = 'Новый'
    RETURNING id, status, shipped_date AS "shippedDate"
  `, [id]);
  if (result.rowCount === 0) fail(404, 'Новый заказ с таким номером не найден');
  res.json(result.rows[0]);
});

// Обработчик ошибок возвращает понятное JSON-сообщение, а не HTML-страницу.
app.use((error, _req, res, _next) => {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.code === '23505') return res.status(409).json({ error: 'Запись с таким названием уже существует' });
  if (error.code === '23503') return res.status(409).json({ error: 'Операция нарушает связи между таблицами: проверь категорию или связанные заказы' });
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }
  console.error('Ошибка сервера:', error);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Не запускаем API, если пароль не задан или база недоступна.
if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === 'CHANGE_ME') {
  console.error('Заполни DB_PASSWORD в файле server/.env');
  process.exit(1);
}
try {
  await pool.query('SELECT 1');
  app.listen(PORT, HOST, () => {
    console.log(`OrderFlow API запущен: http://${HOST}:${PORT}/api/health`);
  });
} catch (error) {
  console.error('Не удалось подключиться к PostgreSQL:', error.message);
  process.exit(1);
}
