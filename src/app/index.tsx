import { useCallback, useEffect, useRef, useState } from 'react';
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
  unitsInOrder: number;
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

// Адрес локального сервера задаётся в корневом .env.local мобильного проекта.
// На Android нельзя использовать 127.0.0.1 для подключения к компьютеру.
const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

// Универсальная функция запроса к нашему REST API.
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new Error('Не задан EXPO_PUBLIC_API_URL в файле .env.local');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверь IP компьютера, Wi-Fi и порт 3000.');
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    let message = `Ошибка сервера (HTTP ${response.status})`;
    if (json && typeof json === 'object' && 'error' in json &&
        typeof json.error === 'string') {
      message = json.error;
    }
    throw new Error(message);
  }
  return json as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Произошла неизвестная ошибка';
}


export default function HomeScreen() {
  // Каталог и заказы теперь приходят из PostgreSQL через сервер.
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState('');

  // Состояния формы товара
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStock, setProductStock] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');

  // Состояния категорий и поиска
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);

  // Состояния оформления заказов
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customer, setCustomer] = useState('');
  const [employee, setEmployee] = useState('Оператор');
  const [shipName, setShipName] = useState('');
  const [shipAddress, setShipAddress] = useState('');
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const orderFormY = useRef(0);
  const [discountText, setDiscountText] = useState('0');
  const [orderError, setOrderError] = useState('');

  const pageRef = useRef<ScrollView>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [newCategories, newProducts, newOrders] = await Promise.all([
        apiRequest<Category[]>('/api/categories'),
        apiRequest<Product[]>('/api/products'),
        apiRequest<Order[]>('/api/orders'),
      ]);
      setCategories(newCategories);
      setProducts(newProducts);
      setOrders(newOrders);
      setSelectedCategoryId((current) =>
        newCategories.some((category) => category.id === current)
          ? current : (newCategories[0]?.id ?? 0)
      );
      // Удаляем из корзины только товары, которых больше нет в каталоге.
      // Во время редактирования заказа его позиции могут иметь нулевой свободный остаток.
      setCart((current) => current.filter((item) =>
        newProducts.some((product) => product.id === item.productId)
      ));
      setSyncError('');
    } catch (error) {
      setSyncError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
    setSelectedCategoryId(categories[0]?.id ?? 0);
    setEditingId(null);
    setFormError('');
  }

  // Добавление и редактирование выполняются через REST API.
  async function saveProduct() {
    if (busy) return;
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

    setBusy(true);
    setFormError('');
    try {
      const body = JSON.stringify({ name, price, stock, categoryId: selectedCategoryId });
      if (editingId !== null) {
        await apiRequest<Product>(`/api/products/${editingId}`, { method: 'PUT', body });
      } else {
        await apiRequest<Product>('/api/products', { method: 'POST', body });
      }
      clearProductForm();
      await loadData();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
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
    if (busy) return;
    Alert.alert('Удаление товара', `Удалить «${product.name}»?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await apiRequest<{ message: string }>(`/api/products/${product.id}`, { method: 'DELETE' });
            setCart((current) => current.filter((item) => item.productId !== product.id));
            if (editingId === product.id) clearProductForm();
            await loadData();
          } catch (error) {
            Alert.alert('Удаление не выполнено', errorMessage(error));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function editCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryDescription(category.description);
    setCategoryError('');
    setShowCategoryForm(true);
  }

  function resetCategoryForm() {
    setEditingCategoryId(null);
    setCategoryName('');
    setCategoryDescription('');
    setCategoryError('');
    setShowCategoryForm(false);
  }

  function deleteCategory(category: Category) {
    if (busy) return;
    Alert.alert('Удаление категории', `Удалить категорию «${category.name}»? Категории с товарами удалить нельзя.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await apiRequest(`/api/categories/${category.id}`, { method: 'DELETE' });
          if (editingCategoryId === category.id) resetCategoryForm();
          await loadData();
        } catch (error) {
          Alert.alert('Не удалось удалить категорию', errorMessage(error));
        } finally {
          setBusy(false);
        }
      } },
    ]);
  }

  // Создание и изменение категории выполняются через REST API.
  async function saveCategory() {
    if (busy) return;
    const name = categoryName.trim();
    if (!name) {
      setCategoryError('Введите название категории');
      return;
    }
    if (categories.some((category) => category.id !== editingCategoryId && category.name.toLowerCase() === name.toLowerCase())) {
      setCategoryError('Такая категория уже существует');
      return;
    }

    setBusy(true);
    setCategoryError('');
    try {
      const category = await apiRequest<Category>(
        editingCategoryId === null ? '/api/categories' : `/api/categories/${editingCategoryId}`,
        {
          method: editingCategoryId === null ? 'POST' : 'PUT',
          body: JSON.stringify({ name, description: categoryDescription.trim() }),
        },
      );
      resetCategoryForm();
      setSelectedCategoryId(category.id);
      await loadData();
    } catch (error) {
      setCategoryError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // При редактировании ранее списанное количество данного заказа снова доступно в форме.
  function availableForOrder(product: Product): number {
    if (editingOrderId === null) return product.stock;
    const originalOrder = orders.find((order) => order.id === editingOrderId);
    const previousQuantity = originalOrder?.details.find((line) => line.productId === product.id)?.quantity ?? 0;
    return product.stock + previousQuantity;
  }

  function editOrder(order: Order) {
    if (busy || order.status !== 'Новый') return;
    setEditingOrderId(order.id);
    setCart(order.details.map((line) => ({ productId: line.productId, quantity: line.quantity })));
    setCustomer(order.customer);
    setEmployee(order.employee);
    setShipName(order.shipName);
    setShipAddress(order.shipAddress);
    setDiscountText(String(order.details[0]?.discountPercent ?? 0));
    setOrderError('');
    pageRef.current?.scrollTo({ y: orderFormY.current, animated: true });
  }

  function cancelOrderEdit() {
    setEditingOrderId(null);
    setCart([]);
    setCustomer('');
    setEmployee('Оператор');
    setShipName('');
    setShipAddress('');
    setDiscountText('0');
    setOrderError('');
  }

  function deleteOrder(order: Order) {
    if (busy) return;
    const note = order.status === 'Новый'
      ? 'После удаления нового заказа его товары вернутся на склад.'
      : 'Заказ уже отгружен, поэтому остатки на складе не изменятся.';
    Alert.alert('Удаление заказа', `Удалить заказ №${order.id}? ${note}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await apiRequest(`/api/orders/${order.id}`, { method: 'DELETE' });
          if (editingOrderId === order.id) cancelOrderEdit();
          await loadData();
        } catch (error) {
          Alert.alert('Не удалось удалить заказ', errorMessage(error));
        } finally {
          setBusy(false);
        }
      } },
    ]);
  }

  // Изменяем количество товаров в заказе, не превышая доступный остаток.
  function changeCartQuantity(productId: number, delta: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const currentQty = cart.find((item) => item.productId === productId)?.quantity ?? 0;
    const newQty = currentQty + delta;
    if (newQty > availableForOrder(product)) {
      Alert.alert('Недостаточно товара', `Доступно для этого заказа: ${availableForOrder(product)} шт.`);
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

  // Сервер создаёт/редактирует заказ и списывает остатки в транзакции PostgreSQL.
  async function saveOrder() {
    if (busy) return;
    if (!customer.trim()) {
      setOrderError('Введите имя или название клиента');
      return;
    }
    if (!employee.trim()) {
      setOrderError('Введите имя сотрудника');
      return;
    }
    if (!shipName.trim() || !shipAddress.trim()) {
      setOrderError('Укажите название и адрес магазина');
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
      if (line.quantity > availableForOrder(line.product)) {
        setOrderError(`Недостаточно товара «${line.product.name}» на складе`);
        return;
      }
    }

    setBusy(true);
    setOrderError('');
    try {
      const isEditing = editingOrderId !== null;
      const saved = await apiRequest<{ id: number; totalCents: number }>(
        isEditing ? `/api/orders/${editingOrderId}` : '/api/orders',
        {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify({
            customer: customer.trim(),
            employee: employee.trim(),
            shipName: shipName.trim(),
            shipAddress: shipAddress.trim(),
            discountPercent: discount,
            items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          }),
        },
      );
      // Очищаем форму только после подтверждения от сервера.
      cancelOrderEdit();
      Alert.alert(isEditing ? 'Заказ изменён' : 'Заказ оформлен',
        `Заказ №${saved.id} на сумму ${formatMoney(saved.totalCents)}`);
      await loadData();
    } catch (error) {
      setOrderError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function shipOrder(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/orders/${id}/ship`, { method: 'PATCH' });
      await loadData();
    } catch (error) {
      Alert.alert('Ошибка отгрузки', errorMessage(error));
    } finally {
      setBusy(false);
    }
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

      {/* Состояние соединения с сервером и ручное обновление */}
      <View style={styles.connectionPanel}>
        <Text style={syncError ? styles.error : styles.mutedText}>
          {syncError ? `Нет связи с API: ${syncError}`
            : loading ? 'Загружаем данные с сервера...'
            : 'Данные загружены из PostgreSQL'}
        </Text>
        <Pressable
          style={styles.reloadButton}
          onPress={() => void loadData()}
          disabled={busy || loading}
        >
          <Text style={styles.actionLink}>Обновить данные</Text>
        </Pressable>
        {busy && <Text style={styles.mutedText}>Сохраняем изменения...</Text>}
      </View>

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
        <Pressable style={styles.primaryButton} onPress={saveProduct} disabled={busy || loading}>
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
          <Pressable onPress={() => showCategoryForm ? resetCategoryForm() : setShowCategoryForm(true)}>
            <Text style={styles.actionLink}>
              {showCategoryForm ? 'Отмена' : '+ Добавить'}
            </Text>
          </Pressable>
        </View>
        {categories.map((category) => (
          <View key={category.id} style={styles.categoryRow}>
            <Text style={styles.mutedText}>{category.name}</Text>
            <Pressable onPress={() => editCategory(category)} disabled={busy || loading}>
              <Text style={styles.actionLink}>Изменить</Text>
            </Pressable>
            <Pressable onPress={() => deleteCategory(category)} disabled={busy || loading}>
              <Text style={styles.deleteText}>Удалить</Text>
            </Pressable>
          </View>
        ))}
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
            <Pressable style={styles.primaryButton} onPress={saveCategory} disabled={busy || loading}>
              <Text style={styles.primaryButtonText}>
                {editingCategoryId === null ? 'Добавить категорию' : 'Сохранить изменения'}
              </Text>
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
            {' · '}В новых заказах: {product.unitsInOrder ?? 0} шт.
          </Text>
          <Text style={styles.price}>{product.price.toFixed(2)} ₽</Text>
          <View style={styles.actionsRow}>
            <Pressable onPress={() => editProduct(product)} disabled={busy || loading}>
              <Text style={styles.editText}>Редактировать</Text>
            </Pressable>
            <Pressable onPress={() => changeCartQuantity(product.id, 1)} disabled={busy || loading || availableForOrder(product) === 0}>
              <Text style={availableForOrder(product) > 0 ? styles.cartLink : styles.disabledText}>
                {availableForOrder(product) > 0 ? '+ В заказ' : 'Нет на складе'}
              </Text>
            </Pressable>
            <Pressable onPress={() => deleteProduct(product)} disabled={busy || loading}>
              <Text style={styles.deleteText}>Удалить</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {filteredProducts.length === 0 && (
        <Text style={styles.emptyText}>Товары не найдены</Text>
      )}

      {/* Корзина и оформление нового заказа */}
      <View style={styles.panel} onLayout={(event) => { orderFormY.current = event.nativeEvent.layout.y; }}>
        <Text style={styles.sectionTitle}>
          {editingOrderId === null ? 'Новый заказ' : `Редактирование заказа №${editingOrderId}`}
        </Text>
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
                {formatMoney(toCents(product.price))} за шт. · Доступно: {availableForOrder(product)}
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
          placeholder="Наименование магазина (обязательно)"
          value={shipName}
          onChangeText={setShipName}
        />
        <TextInput
          style={styles.input}
          placeholder="Адрес магазина (обязательно)"
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
        <Pressable style={styles.primaryButton} onPress={saveOrder} disabled={busy || loading}>
          <Text style={styles.primaryButtonText}>
            {editingOrderId === null ? 'Оформить заказ' : 'Сохранить заказ'}
          </Text>
        </Pressable>
        {editingOrderId !== null && (
          <Pressable style={styles.secondaryButton} onPress={cancelOrderEdit}>
            <Text style={styles.secondaryButtonText}>Отменить редактирование заказа</Text>
          </Pressable>
        )}
      </View>

      {/* История заказов загружается из PostgreSQL */}
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
          <Text style={styles.mutedText}>Магазин: {order.shipName}</Text>
          <Text style={styles.mutedText}>Адрес магазина: {order.shipAddress}</Text>
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
          <View style={styles.orderActions}>
            {order.status === 'Новый' && (
              <Pressable onPress={() => editOrder(order)} disabled={busy || loading}>
                <Text style={styles.actionLink}>Изменить</Text>
              </Pressable>
            )}
            {order.status === 'Новый' && (
              <Pressable onPress={() => void shipOrder(order.id)} disabled={busy || loading}>
                <Text style={styles.cartLink}>Отгрузить</Text>
              </Pressable>
            )}
            <Pressable onPress={() => deleteOrder(order)} disabled={busy || loading}>
              <Text style={styles.deleteText}>Удалить</Text>
            </Pressable>
          </View>
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
  connectionPanel: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 16 },
  reloadButton: { marginTop: 10, alignSelf: 'flex-start' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14 },
  statLabel: { fontSize: 13, color: '#68788A' },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#2563EB', marginTop: 8 },
  panel: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  orderActions: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 16, flexWrap: 'wrap' },
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
