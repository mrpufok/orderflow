# OrderFlow — серверная часть

Учебная клиент-серверная система учёта заказов, вариант № 15.

## Что реализовано

- PostgreSQL: категории, товары, заказы, состав заказа.
- REST API на Node.js и Express.
- Проверка ввода на сервере.
- Транзакционное создание заказа, списание остатков и блокировка строк от конкурентного списания.
- Фиксация цены товара на момент заказа.
- Суммы хранятся в целых копейках.

## Быстрый запуск на Windows

1. Установить PostgreSQL с pgAdmin: https://www.postgresql.org/download/windows/
2. Через pgAdmin создать базу `orderflow_db` под пользователем `postgres`.
3. В pgAdmin выбрать `orderflow_db` → Query Tool → открыть и запустить `db/schema.sql`, затем `db/seed.sql`.
4. В PowerShell перейти в папку `server` и выполнить `npm install`.
5. Создать `server/.env` из примера: `Copy-Item .env.example .env`. Указать действительный пароль `DB_PASSWORD`.
6. Выполнить `npm run dev`.
7. Открыть http://127.0.0.1:3000/api/health — должен появиться JSON со `status: ok` и `database: connected`.
8. Открыть http://127.0.0.1:3000/api/products — должен появиться список трёх тестовых товаров.

Текущий мобильный экран пока работает в автономном режиме. Подключение к API — следующий урок.

## Методы API

| Метод | Адрес | Назначение |
|---|---|---|
| GET | `/api/health` | Проверка соединения |
| GET | `/api/categories` | Список категорий |
| POST | `/api/categories` | Новая категория |
| GET | `/api/products` | Список товаров (`search`, `categoryId`) |
| POST | `/api/products` | Новый товар |
| PUT | `/api/products/:id` | Изменить товар |
| DELETE | `/api/products/:id` | Удалить товар (если ещё не в заказах) |
| GET | `/api/orders` | История заказов и состав каждой покупки |
| POST | `/api/orders` | Создать заказ и списать остатки |
| PATCH | `/api/orders/:id/ship` | Отметить заказ как отгруженный |

Примеры запросов (в другой вкладке PowerShell при запущенном сервере):

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-RestMethod http://127.0.0.1:3000/api/categories
Invoke-RestMethod http://127.0.0.1:3000/api/products
```

Пример создания товара:

```powershell
$body = @{ name = 'Ноутбук'; categoryId = 3; price = 45000; stock = 4 } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/products -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

Пример создания заказа:

```powershell
$body = @{
  customer = 'Иванов Иван'
  employee = 'Оператор'
  shipAddress = 'Самовывоз'
  discountPercent = 10
  items = @(@{ productId = 1; quantity = 2 }, @{ productId = 2; quantity = 1 })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/orders -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

**Замечания:**

- Это локальный учебный сервер **без авторизации**. Не публикуй его в интернет без дополнительной защиты.
- Для локальной проверки используется `HOST=127.0.0.1`. Для доступа с телефона понадобится отдельная настройка сети и Windows Firewall.
- `.env` содержит пароль БД и должен оставаться вне Git. В репозитории хранится только `.env.example`.
- История заказов сохраняет исходные цены. Удалить товар, на который уже оформлен заказ, нельзя: PostgreSQL защищает ссылки внешними ключами.
- Для примера используется поле `discountPercent` на весь заказ. Его значение записывается в каждую позицию заказа.
