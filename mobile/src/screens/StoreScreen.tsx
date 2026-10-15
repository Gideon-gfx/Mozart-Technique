import { FlatList } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native';

import { resolveMediaUrl } from '../api/client';
import * as storeApi from '../api/store';
import type { StoreCategory, StoreProductSummary } from '../api/types';
import BackButton from '../components/BackButton';
import ScreenWatermark from '../components/ScreenWatermark';
import { useTourTarget } from '../context/TourTargetsContext';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useCart } from '../context/CartContext';
import type { StoreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<StoreStackParamList, 'StoreHome'>;

function stars(rating: number | null) {
  const full = Math.round(rating || 0);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

function ProductCard({ item, colors, onPress }: { item: StoreProductSummary; colors: ThemeColors; onPress: () => void }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const image = resolveMediaUrl(item.coverImage);
  return (
    <Pressable style={styles.productCard} onPress={onPress}>
      <View style={styles.productImageWrap}>
        {image ? <Image source={{ uri: image }} style={styles.productImage} /> : <View style={[styles.productImage, styles.productImagePlaceholder]} />}
        {!item.inStock ? (
          <View style={styles.outBadge}>
            <Text style={styles.outBadgeText}>Out of stock</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.productRating}>{stars(item.avgRating)} <Text style={styles.productReviewCount}>({item.reviewCount || 0})</Text></Text>
      <Text style={styles.productPrice}>{item.symbol}{item.priceLocal.toFixed(2)} <Text style={styles.productCurrency}>{item.currency}</Text></Text>
    </Pressable>
  );
}

// Native rebuild of store.html: hero, category grid, featured products,
// live search - real /api/store/* data throughout. This is the Store TAB
// itself (product catalog), distinct from Store Profile (orders/addresses/
// account, reached from the Profile menu).
export default function StoreScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { count } = useCart();
  const headerTargetRef = useTourTarget('store-main');

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [featured, setFeatured] = useState<StoreProductSummary[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StoreProductSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([storeApi.fetchCategories(), storeApi.fetchProducts({ sort: 'featured' })])
      .then(([catData, prodData]) => {
        setCategories(catData.categories);
        setFeatured(prodData.products);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      storeApi
        .fetchProducts({ q: text.trim() })
        .then((data) => setResults(data.products))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }, []);

  // ProductDetail/Category are now direct StoreStack siblings (no
  // getParent hop needed); Home and Cart moved one level further away -
  // Home lives on the Tab.Navigator this stack sits inside (one hop up),
  // Cart lives on MainStack above that (two hops up).
  const openProduct = useCallback((slug: string) => navigation.navigate('ProductDetail', { slug }), [navigation]);

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View ref={headerTargetRef} collapsable={false} style={styles.header}>
        <View style={styles.headerLeft}>
          <BackButton onPress={() => navigation.getParent()?.navigate('Home')} />
          <Text style={styles.title}>Store</Text>
        </View>
        <Pressable style={styles.cartBtn} onPress={() => navigation.getParent()?.getParent()?.navigate('Cart')} hitSlop={8}>
          <Ionicons name="cart-outline" size={22} color={colors.text} />
          {count > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{count > 99 ? '99+' : count}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search sheet music, instruments, accessories..."
          placeholderTextColor={colors.textFaint}
          returnKeyType="search"
        />
        {searching ? <ActivityIndicator size="small" color={colors.primaryRed} /> : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : results !== null ? (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => <ProductCard item={item} colors={colors} onPress={() => openProduct(item.slug)} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="search" size={28} color={colors.textFaint} />
              <Text style={styles.emptyText}>No products found for &quot;{query}&quot;.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={featured}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => <ProductCard item={item} colors={colors} onPress={() => openProduct(item.slug)} />}
          ListHeaderComponent={
            <View>
              <LinearGradient colors={['#050b10', '#1a0505']} style={styles.hero}>
                <Text style={styles.heroTitle}>Everything for your musical journey</Text>
                <Text style={styles.heroSub}>Sheet music, instruments, accessories and digital tools - priced in your currency.</Text>
              </LinearGradient>

              <Text style={styles.sectionTitle}>Shop by category</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={categories}
                keyExtractor={(c) => c.key}
                contentContainerStyle={styles.categoryRow}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.categoryCard}
                    onPress={() => navigation.navigate('Category', { category: item.key, title: item.title })}
                  >
                    <Image source={{ uri: item.image }} style={styles.categoryImage} />
                    <View style={styles.categoryOverlay} />
                    <Text style={styles.categoryLabel} numberOfLines={2}>
                      {item.title}
                      {item.productCount ? <Text style={styles.categoryCount}>{`  (${item.productCount})`}</Text> : null}
                    </Text>
                  </Pressable>
                )}
              />

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Featured products</Text>
                <Pressable onPress={() => navigation.navigate('Category', { category: 'all', title: 'All products' })}>
                  <Text style={styles.sectionLink}>New arrivals →</Text>
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="storefront-outline" size={28} color={colors.textFaint} />
              <Text style={styles.emptyText}>The store is being stocked. Check back soon.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontSize: 22, fontFamily: fonts.displayBlack, color: colors.text },
    cartBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    cartBadge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    cartBadgeText: { color: '#fff', fontSize: 9, fontFamily: fonts.bodyBold },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 13.5, fontFamily: fonts.body, color: colors.text },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 60, gap: 8 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 13 },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    hero: {
      borderRadius: 18,
      paddingVertical: 28,
      paddingHorizontal: 20,
      marginBottom: 22,
      alignItems: 'center',
    },
    heroTitle: { color: '#fff', fontSize: 19, fontFamily: fonts.displayBlack, textAlign: 'center', marginBottom: 8 },
    heroSub: { color: 'rgba(255,255,255,0.72)', fontSize: 12.5, fontFamily: fonts.body, textAlign: 'center', lineHeight: 18 },
    sectionTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 12 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
    sectionLink: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primaryRed },
    categoryRow: { gap: 10, paddingBottom: 24 },
    categoryCard: {
      width: 140,
      height: 100,
      borderRadius: 14,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    categoryImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    categoryOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
    categoryLabel: { color: '#fff', fontSize: 12, fontFamily: fonts.bodyBold, padding: 10, lineHeight: 15 },
    categoryCount: { fontSize: 10.5, fontFamily: fonts.body, opacity: 0.85 },
    productRow: { gap: 12 },
    productCard: { flex: 1, marginBottom: 18 },
    productImageWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
    productImage: { width: '100%', aspectRatio: 1, backgroundColor: colors.surface },
    productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    outBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      backgroundColor: 'rgba(0,0,0,0.65)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    outBadgeText: { color: '#fff', fontSize: 9.5, fontFamily: fonts.bodyBold },
    productName: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 3, lineHeight: 16 },
    productRating: { fontSize: 11, color: '#f5a623', marginBottom: 3 },
    productReviewCount: { color: colors.textFaint, fontFamily: fonts.body },
    productPrice: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    productCurrency: { fontSize: 10, fontFamily: fonts.body, color: colors.textFaint },
  });
}
