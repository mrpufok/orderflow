
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';


// Описываем структуру товара
type Product = {
  id: number;
  name: string;
  price: number;
};

// Первые тестовые товары
const initialProducts: Product[] = [
  { id: 1, name: 'Клавиатура', price: 1500 },
  { id: 2, name: 'Компьютерная мышь', price: 900 },
  { id: 3, name: 'Монитор', price: 12500 },
];

export default function HomeScreen() {
  const [products, setProducts] =
    useState<Product[]>(initialProducts);

  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [formError, setFormError] = useState('');

  // Добавление товара
  
  function addProduct() {
    const name = productName.trim();
    const priceText = productPrice.trim().replace(',', '.');
    const price = Number(priceText);

    if (!name) {
      setFormError('Введите название товара');
      return;
    }

    if (
      !/^\d+(\.\d{1,2})?$/.test(priceText) ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      setFormError('Введите корректную цену больше нуля');
      return;
    }

    const nextId =
      Math.max(0, ...products.map((p) => p.id)) + 1;

    const newProduct: Product = {
      id: nextId,
      name: name,
      price: price,
    };

    setProducts([...products, newProduct]);

    setProductName('');
    setProductPrice('');
    setFormError('');
  }


  // Удаление товара
  function deleteProduct(id: number) {
    setProducts(
      products.filter((product) => product.id !== id)
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>OrderFlow</Text>
      <Text style={styles.subtitle}>
        Система учёта заказов
      </Text>

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>
          Товаров в каталоге
        </Text>
        <Text style={styles.summaryNumber}>
          {products.length}
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>
          Новый товар
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

        {formError !== '' && (
          <Text style={styles.error}>
            {formError}
          </Text>
        )}
      </View>

      <Pressable
        style={styles.addButton}
        onPress={addProduct}
      >
        <Text style={styles.addButtonText}>
          + Добавить товар
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>
        Каталог товаров
      </Text>

      {products.map((product) => (
        <View key={product.id} style={styles.card}>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>
              {product.name}
            </Text>
            <Text style={styles.price}>
              {product.price} ₽
            </Text>
          </View>

          <Pressable
            onPress={() => deleteProduct(product.id)}
          >
            <Text style={styles.deleteText}>
              Удалить
            </Text>
          </Pressable>
        </View>
      ))}

      {products.length === 0 && (
        <Text style={styles.emptyText}>
          Пока нет товаров
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D8E0EB',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    fontSize: 16,
    color: '#1D3557',
  },
  error: {
    color: '#DC2626',
    marginTop: 10,
  },
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  content: {
    padding: 20,
    paddingTop: 35,
    paddingBottom: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  subtitle: {
    fontSize: 15,
    color: '#68788A',
    marginTop: 5,
    marginBottom: 25,
  },
  summary: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#68788A',
  },
  summaryNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2563EB',
    marginTop: 8,
  },
  addButton: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 28,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
  },
  price: {
    fontSize: 15,
    color: '#2563EB',
    marginTop: 6,
  },
  deleteText: {
    color: '#DC2626',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    color: '#68788A',
    marginTop: 25,
  },
});
