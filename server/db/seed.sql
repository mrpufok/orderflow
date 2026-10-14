-- Тестовые данные как в мобильном приложении урока 8.
-- Можно запускать повторно: одинаковые категории и товары не дублируются.

INSERT INTO categories (name, description) VALUES
  ('Периферия', 'Клавиатуры и мыши'),
  ('Мониторы', 'Экраны и дисплеи'),
  ('Прочее', 'Другие товары')
ON CONFLICT DO NOTHING;

INSERT INTO products (category_id, name, price_cents, stock)
SELECT c.id, v.name, v.price_cents, v.stock
FROM (VALUES
  ('Периферия', 'Клавиатура', 150000, 12),
  ('Периферия', 'Компьютерная мышь', 90000, 25),
  ('Мониторы', 'Монитор', 1250000, 5)
) AS v(category_name, name, price_cents, stock)
JOIN categories c ON c.name = v.category_name
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.name = v.name
);
