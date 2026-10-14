-- Структура базы данных OrderFlow (вариант № 15).
-- Выполняется в базе orderflow_db через Query Tool в pgAdmin.

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    CONSTRAINT category_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_ci_idx
    ON categories (lower(name));

CREATE TABLE IF NOT EXISTS products (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer VARCHAR(200) NOT NULL,
    employee VARCHAR(200) NOT NULL,
    order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shipped_date TIMESTAMPTZ,
    ship_name VARCHAR(200) NOT NULL,
    ship_address TEXT NOT NULL DEFAULT 'Самовывоз',
    status VARCHAR(20) NOT NULL DEFAULT 'Новый'
        CHECK (status IN ('Новый', 'Отгружен')),
    total_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    CONSTRAINT customer_not_blank CHECK (length(trim(customer)) > 0),
    CONSTRAINT employee_not_blank CHECK (length(trim(employee)) > 0)
);

CREATE TABLE IF NOT EXISTS order_details (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    discount_hundredths INTEGER NOT NULL DEFAULT 0
        CHECK (discount_hundredths BETWEEN 0 AND 10000),
    line_total_cents BIGINT NOT NULL CHECK (line_total_cents >= 0),
    PRIMARY KEY (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS orders_order_date_idx ON orders(order_date DESC);
CREATE INDEX IF NOT EXISTS order_details_product_idx ON order_details(product_id);
