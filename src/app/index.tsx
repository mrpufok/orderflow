import { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Category = {
  id: number;
  name: string;
  description: string;
};

type Product = {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  stock: number;
};

// Состав заказа хранит цену на момент его создания.
type OrderDetail = {
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
  lineTotalCents: number;
};

type Order = {
  id: number;
  customer: string;
  employee: string;
  orderDate: string;
  shippedDate: string | null;
  shipName: string;
  shipAddress: string;
  status: 'Новый' | 'Отгружен';
  details: OrderDetail[];
  totalCents: number;
};

type CartItem = {
  productId: number;
  quantity: number;
};

// Все суммы считаем в копейках, чтобы уменьшить ошибки округления.
function toCents(price: number) {
  return Math.round(price * 100);
}

function formatMoney(cents: number) {
  return `${(cents / 100).toFixed(2)} ₽`;
}

function lineTotalCents(unitCents: number, quantity: number, discount: number) {
  const discountHundredths = Math.round(discount * 100);
  return Math.round(unitCents * quantity * (10000 - discountHundredths) / 10000);
}

const initialCategories: Category[] = [
  { id: 1, name: 'Периферия', description: 'Клавиатуры и мыши' },
  { id: 2, name: 'Мониторы', description: 'Экраны и дисплеи' },
  { id: 3, name: 'Прочее', description: 'Другие товары' },
];

const initialProducts: Product[] = [
  { id: 1, categoryId: 1, name: 'Клавиатура', price: 1500, stock: 12 },
  { id: 2, categoryId: 1, name: 'Компьютерная мышь', price: 900, stock: 25 },
  { id: 3, categoryId: 2, name: 'Монитор', price: 12500, stock: 5 },
];

export default function HomeScreen() {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);

  // Состояния формы товара
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStock, setProductStock] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');

  // Состояния категорий и поиска
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);

  // Состояния оформления заказов
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customer, setCustomer] = useState('');
  const [employee, setEmployee] = useState('Оператор');
  const [shipAddress, setShipAddress] = useState('');
  const [discountText, setDiscountText] = useState('0');
  const [orderError, setOrderError] = useState('');

  const nextOrderId = useRef(1);
  const nextProductId = useRef(4);
  const nextCategoryId = useRef(4);
  const pageRef = useRef<ScrollView>(null);

  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);

  const filteredProducts = products.filter((product) => {
    const matchesName = product.name
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesCategory =
      filterCategoryId === null || product.categoryId === filterCategoryId;
    return matchesName && matchesCategory;
  });

  const discountInput = discountText.trim().replace(',', '.');
  const isDiscountValid = /^\d+(\.\d{1,2})?$/.test(discountInput) &&
    Number(discountInput) >= 0 && Number(discountInput) <= 100;
  const discount = isDiscountValid ? Number(discountInput) : 0;
  const cartLines = cart.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ product, quantity: item.quantity }] : [];
  });
  const cartTotalCents = cartLines.reduce(
    (sum, line) => sum + lineTotalCents(
      toCents(line.product.price), line.quantity, discount
    ),
    0
  );

  function categoryNameById(id: number) {
    return categories.find((category) => category.id === id)?.name ?? 'Без категории';
  }

  function clearProductForm() {
    setProductName('');
    setProductPrice('');
    setProductStock('');
    setSelectedCategoryId(1);
    setEditingId(null);
    setFormError('');
  }

  // Одна форма используется для создания и редактирования
  function saveProduct() {
    const name = productName.trim();
    const priceText = productPrice.trim().replace(',', '.');
    const stockText = productStock.trim();
    const price = Number(priceText);
    const stock = Number(stockText);

    if (!name) {
      setFormError('Введите название товара');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(priceText) || !Number.isFinite(price) || price <= 0) {
      setFormError('Введите корректную цену больше нуля');
      return;
    }
    if (!/^\d+$/.test(stockText) || !Number.isSafeInteger(stock)) {
      setFormError('Количество должно быть целым числом от 0');
      return;
    }
    if (!categories.some((category) => category.id === selectedCategoryId)) {
      setFormError('Выберите категорию');
      return;
    }

    if (editingId !== null) {
      setProducts((current) =>
        current.map((product) =>
          product.id === editingId
            ? { ...product, name, price, stock, categoryId: selectedCategoryId }
            : product
        )
      );
    } else {
      const newProduct: Product = {
        id: nextProductId.current++,
        name,
        price,
        stock,
        categoryId: selectedCategoryId,
      };
      setProducts((current) => [...current, newProduct]);
    }
    clearProductForm();
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setProductName(product.name);
    setProductPrice(String(product.price));
    setProductStock(String(product.stock));
    setSelectedCategoryId(product.categoryId);
    setFormError('');
    pageRef.current?.scrollTo({ y: 0, animated: true });
  }

  function deleteProduct(product: Product) {
    Alert.alert('Удаление товара', `Удалить «${product.name}»?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          setProducts((current) => current.filter((item) => item.id !== product.id));
          setCart((current) => current.filter((item) => item.productId !== product.id));
          if (editingId === product.id) clearProductForm();
        },
      },
    ]);
  }

  // Добавление категории без отдельного экрана
  function addCategory() {
    const name = categoryName.trim();
    if (!name) {
      setCategoryError('Введите название категории');
      return;
    }
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setCategoryError('Такая категория уже существует');
      return;
    }

    const newCategory: Category = {
      id: nextCategoryId.current++,
      name,
      description: categoryDescription.trim(),
    };
    setCategories((current) => [...current, newCategory]);
    setSelectedCategoryId(newCategory.id);
    setCategoryName('');
    setCategoryDescription('');
    setCategoryError('');
    setShowCategoryForm(false);
  }

  // Изменяем количество товаров в заказе, не превышая остаток.
  function changeCartQuantity(productId: number, delta: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const currentQty = cart.find((item) => item.productId === productId)?.quantity ?? 0;
    const newQty = currentQty + delta;
    if (newQty > product.stock) {
      Alert.alert('Недостаточно товара', `На складе только ${product.stock} шт.`);
      return;
    }
    setCart((current) => {
      if (newQty <= 0) return current.filter((item) => item.productId !== productId);
      return current.some((item) => item.productId === productId)
        ? current.map((item) => item.productId === productId
            ? { ...item, quantity: newQty } : item)
        : [...current, { productId, quantity: newQty }];
    });
    setOrderError('');
  }

  // Создаём заказ и уменьшаем складские остатки.
  function createOrder() {
    if (!customer.trim()) {
      setOrderError('Введите имя или название клиента');
      return;
    }
    if (!employee.trim()) {
      setOrderError('Введите имя сотрудника');
      return;
    }
    if (!isDiscountValid) {
      setOrderError('Скидка должна быть от 0 до 100% (не более двух знаков после запятой)');
      return;
    }
    if (cartLines.length === 0) {
      setOrderError('Добавьте хотя бы один товар в заказ');
      return;
    }
    for (const line of cartLines) {
      if (line.quantity > line.product.stock) {
        setOrderError(`Недостаточно товара «${line.product.name}» на складе`);
        return;
      }
    }

    const details: OrderDetail[] = cartLines.map(({ product, quantity }) => {
      const unitPriceCents = toCents(product.price);
      return {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPriceCents,
        discountPercent: discount,
        lineTotalCents: lineTotalCents(unitPriceCents, quantity, discount),
      };
    });
    const newOrder: Order = {
      id: nextOrderId.current++,
      customer: customer.trim(),
      employee: employee.trim(),
      orderDate: new Date().toISOString(),
      shippedDate: null,
      shipName: customer.trim(),
      shipAddress: shipAddress.trim() || 'Самовывоз',
      status: 'Новый',
      details,
      totalCents: details.reduce((sum, line) => sum + line.lineTotalCents, 0),
    };

    setProducts((current) => current.map((product) => {
      const sold = details.find((line) => line.productId === product.id)?.quantity ?? 0;
      return { ...product, stock: product.stock - sold };
    }));
    setOrders((current) => [newOrder, ...current]);
    setCart([]);
    setCustomer('');
    setShipAddress('');
    setDiscountText('0');
    setOrderError('');
    Alert.alert('Заказ оформлен', `Заказ №${newOrder.id} на сумму ${formatMoney(newOrder.totalCents)}`);
  }

  function shipOrder(id: number) {
    setOrders((current) => current.map((order) =>
      order.id === id && order.status === 'Новый'
        ? { ...order, status: 'Отгружен' as const, shippedDate: new Date().toISOString() }
        : order
    ));
  }

  return (
    <ScrollView
      ref={pageRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>OrderFlow</Text>
      <Text style={styles.subtitle}>Система учёта заказов</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Видов товаров</Text>
          <Text style={styles.statValue}>{products.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Единиц на складе</Text>
          <Text style={styles.statValue}>{totalStock}</Text>
        </View>
      </View>

      {/* Создание и редактирование товара */}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>
          {editingId === null ? 'Новый товар' : 'Редактирование товара'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Название товара"
          value={productName}
          onChangeText={setProductName}
        />
        <TextInput
          style={styles.input}
          placeholder="Цена в рублях"
          keyboardType="decimal-pad"
          value={productPrice}
          onChangeText={setProductPrice}
        />
        <TextInput
          style={styles.input}
          placeholder="Количество на складе"
          keyboardType="number-pad"
          value={productStock}
          onChangeText={setProductStock}
        />

        <Text style={styles.fieldLabel}>Категория товара</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => setSelectedCategoryId(category.id)}
                style={[
                  styles.chip,
                  selectedCategoryId === category.id && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedCategoryId === category.id && styles.chipTextActive,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {formError !== '' && <Text style={styles.error}>{formError}</Text>}
        <Pressable style={styles.primaryButton} onPress={saveProduct}>
          <Text style={styles.primaryButtonText}>
            {editingId === null ? '+ Добавить товар' : 'Сохранить изменения'}
          </Text>
        </Pressable>
        {editingId !== null && (
          <Pressable style={styles.secondaryButton} onPress={clearProductForm}>
            <Text style={styles.secondaryButtonText}>Отменить редактирование</Text>
          </Pressable>
        )}
      </View>

      {/* Управление категориями */}
      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Категории ({categories.length})</Text>
          <Pressable onPress={() => setShowCategoryForm((visible) => !visible)}>
            <Text style={styles.actionLink}>
              {showCategoryForm ? 'Скрыть' : '+ Добавить'}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.mutedText}>
          {categories.map((category) => category.name).join(' · ')}
        </Text>
        {showCategoryForm && (
          <View>
            <TextInput
              style={styles.input}
              placeholder="Название категории"
              value={categoryName}
              onChangeText={setCategoryName}
            />
            <TextInput
              style={styles.input}
              placeholder="Описание категории (необязательно)"
              value={categoryDescription}
              onChangeText={setCategoryDescription}
            />
            {categoryError !== '' && <Text style={styles.error}>{categoryError}</Text>}
            <Pressable style={styles.primaryButton} onPress={addCategory}>
              <Text style={styles.primaryButtonText}>Сохранить категорию</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Поиск и фильтрация каталога */}
      <Text style={styles.sectionTitle}>Каталог товаров</Text>
      <TextInput
        style={[styles.input, styles.searchInput]}
        placeholder="Поиск по названию"
        value={search}
        onChangeText={setSearch}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setFilterCategoryId(null)}
            style={[styles.chip, filterCategoryId === null && styles.chipActive]}
          >
            <Text
              style={[styles.chipText, filterCategoryId === null && styles.chipTextActive]}
            >
              Все
            </Text>
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setFilterCategoryId(category.id)}
              style={[
                styles.chip,
                filterCategoryId === category.id && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  filterCategoryId === category.id && styles.chipTextActive,
                ]}
              >
                {category.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.resultsText}>Найдено товаров: {filteredProducts.length}</Text>
      {filteredProducts.map((product) => (
        <View key={product.id} style={styles.productCard}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.mutedText}>
            {categoryNameById(product.categoryId)} ·{' '}
            {product.stock > 0 ? `На складе: ${product.stock} шт.` : 'Нет в наличии'}
          </Text>
          <Text style={styles.price}>{product.price.toFixed(2)} ₽</Text>
          <View style={styles.actionsRow}>
            <Pressable onPress={() => editProduct(product)}>
              <Text style={styles.editText}>Редактировать</Text>
            </Pressable>
            <Pressable onPress={() => changeCartQuantity(product.id, 1)} disabled={product.stock === 0}>
              <Text style={product.stock > 0 ? styles.cartLink : styles.disabledText}>
                {product.stock > 0 ? '+ В заказ' : 'Нет на складе'}
              </Text>
            </Pressable>
            <Pressable onPress={() => deleteProduct(product)}>
              <Text style={styles.deleteText}>Удалить</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {filteredProducts.length === 0 && (
        <Text style={styles.emptyText}>Товары не найдены</Text>
      )}

      {/* Корзина и оформление нового заказа */}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Новый заказ</Text>
        <Text style={styles.mutedText}>
          Добавляй товары кнопкой «+ В заказ» в каталоге выше.
        </Text>

        {cartLines.length === 0 ? (
          <Text style={styles.emptyText}>В заказе пока нет товаров</Text>
        ) : cartLines.map(({ product, quantity }) => (
          <View key={product.id} style={styles.cartRow}>
            <View style={styles.cartInfo}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.mutedText}>
                {formatMoney(toCents(product.price))} за шт. · Остаток: {product.stock}
              </Text>
            </View>
            <View style={styles.counter}>
              <Pressable style={styles.counterButton} onPress={() => changeCartQuantity(product.id, -1)}>
                <Text style={styles.counterLabel}>−</Text>
              </Pressable>
              <Text style={styles.counterNumber}>{quantity}</Text>
              <Pressable style={styles.counterButton} onPress={() => changeCartQuantity(product.id, 1)}>
                <Text style={styles.counterLabel}>+</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <TextInput
          style={styles.input}
          placeholder="Клиент (обязательно)"
          value={customer}
          onChangeText={setCustomer}
        />
        <TextInput
          style={styles.input}
          placeholder="Сотрудник (обязательно)"
          value={employee}
          onChangeText={setEmployee}
        />
        <TextInput
          style={styles.input}
          placeholder="Адрес доставки (пусто = самовывоз)"
          value={shipAddress}
          onChangeText={setShipAddress}
        />
        <TextInput
          style={styles.input}
          placeholder="Общая скидка, %"
          keyboardType="decimal-pad"
          value={discountText}
          onChangeText={setDiscountText}
        />
        <Text style={styles.totalLabel}>
          Итого со скидкой: {isDiscountValid ? formatMoney(cartTotalCents) : 'Проверьте скидку'}
        </Text>
        {orderError !== '' && <Text style={styles.error}>{orderError}</Text>}
        <Pressable style={styles.primaryButton} onPress={createOrder}>
          <Text style={styles.primaryButtonText}>Оформить заказ</Text>
        </Pressable>
      </View>

      {/* История заказов сохраняется в памяти до перезапуска */}
      <Text style={styles.sectionTitle}>История заказов ({orders.length})</Text>
      {orders.length === 0 && (
        <Text style={styles.emptyText}>Оформленных заказов пока нет</Text>
      )}
      {orders.map((order) => (
        <View key={order.id} style={styles.productCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.productName}>Заказ №{order.id}</Text>
            <Text style={order.status === 'Новый' ? styles.pendingText : styles.shippedText}>
              {order.status}
            </Text>
          </View>
          <Text style={styles.mutedText}>Клиент: {order.customer}</Text>
          <Text style={styles.mutedText}>Сотрудник: {order.employee}</Text>
          <Text style={styles.mutedText}>Создан: {new Date(order.orderDate).toLocaleString('ru-RU')}</Text>
          <Text style={styles.mutedText}>Получатель: {order.shipName}</Text>
          <Text style={styles.mutedText}>Доставка: {order.shipAddress}</Text>
          {order.details.map((line) => (
            <Text key={line.productId} style={styles.orderLine}>
              {line.productName} × {line.quantity} — {formatMoney(line.lineTotalCents)}
              {line.discountPercent > 0 ? ` (−${line.discountPercent}%)` : ''}
            </Text>
          ))}
          <Text style={styles.orderTotal}>Сумма заказа: {formatMoney(order.totalCents)}</Text>
          {order.shippedDate && (
            <Text style={styles.mutedText}>
              Отгружен: {new Date(order.shippedDate).toLocaleString('ru-RU')}
            </Text>
          )}
          {order.status === 'Новый' && (
            <Pressable style={styles.secondaryButton} onPress={() => shipOrder(order.id)}>
              <Text style={styles.actionLink}>Отметить как отгруженный</Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  content: { padding: 20, paddingTop: 35, paddingBottom: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1D3557' },
  subtitle: { fontSize: 15, color: '#68788A', marginTop: 5, marginBottom: 22 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14 },
  statLabel: { fontSize: 13, color: '#68788A' },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#2563EB', marginTop: 8 },
  panel: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 19, fontWeight: 'bold', color: '#1D3557', marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: '#D8E0EB', backgroundColor: '#FFFFFF',
    borderRadius: 9, padding: 12, marginTop: 10, fontSize: 16, color: '#1D3557',
  },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#1D3557', marginTop: 16 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  chip: { paddingVertical: 9, paddingHorizontal: 13, backgroundColor: '#E9EFF8', borderRadius: 20 },
  chipActive: { backgroundColor: '#2563EB' },
  chipText: { color: '#1D3557', fontSize: 14 },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  primaryButton: { backgroundColor: '#2563EB', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: { padding: 12, alignItems: 'center', marginTop: 7 },
  secondaryButtonText: { color: '#68788A', fontSize: 14 },
  error: { color: '#DC2626', marginTop: 10 },
  actionLink: { color: '#2563EB', fontSize: 14, fontWeight: '600' },
  mutedText: { color: '#68788A', fontSize: 14, marginTop: 4 },
  searchInput: { marginTop: 0, marginBottom: 8 },
  resultsText: { color: '#68788A', fontSize: 13, marginBottom: 10 },
  productCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12 },
  productName: { fontSize: 17, fontWeight: '600', color: '#1D3557' },
  price: { fontSize: 16, fontWeight: '600', color: '#2563EB', marginTop: 10 },
  actionsRow: { flexDirection: 'row', gap: 25, marginTop: 16 },
  editText: { color: '#2563EB', fontSize: 14, fontWeight: '600' },
  deleteText: { color: '#DC2626', fontSize: 14 },
  emptyText: { color: '#68788A', textAlign: 'center', padding: 24 },
  cartLink: { color: '#148056', fontSize: 14, fontWeight: '600' },
  disabledText: { color: '#A0A7B2', fontSize: 14 },
  cartRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomColor: '#E8ECF2', borderBottomWidth: 1, paddingVertical: 12,
  },
  cartInfo: { flex: 1, paddingRight: 8 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  counterButton: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#E9EFF8',
    alignItems: 'center', justifyContent: 'center',
  },
  counterLabel: { fontSize: 20, fontWeight: 'bold', color: '#1D3557' },
  counterNumber: { fontSize: 16, minWidth: 18, textAlign: 'center', color: '#1D3557' },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: '#1D3557', marginTop: 18 },
  orderLine: { fontSize: 14, color: '#1D3557', marginTop: 8 },
  orderTotal: { fontSize: 16, fontWeight: 'bold', color: '#2563EB', marginTop: 14 },
  pendingText: { color: '#B36B00', fontWeight: '600' },
  shippedText: { color: '#148056', fontWeight: '600' },
});
