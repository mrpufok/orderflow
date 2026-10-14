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
            <Pressable onPress={() => deleteProduct(product)}>
              <Text style={styles.deleteText}>Удалить</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {filteredProducts.length === 0 && (
        <Text style={styles.emptyText}>Товары не найдены</Text>
      )}
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
});
