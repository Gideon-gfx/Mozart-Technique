import { FlatList } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, StyleSheet, Text, View } from 'react-native';

import { resolveMediaUrl } from '../api/client';
import * as storeApi from '../api/store';
import type { ProductSearchParams } from '../api/store';
import type { StoreProductSummary } from '../api/types';
import { useCart } from '../context/CartContext';
import type { StoreStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<StoreStackParamList, 'Category'>;

const SORTS: { value: NonNullable<ProductSearchParams['sort']>; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'new', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

function stars(rating: number | null) {
  const full = Math.round(rating || 0);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

// Mirrors category.html: an image hero for the chosen category (dark
// gradient hero for "all", matching store.html's own hero when there's no
// single category image to show), a result count, sort (pills here instead
// of a <select>, matching the rest of the app's filter pattern), and the
// same real /api/store/products grid + search suggestions the web version
// uses.
export default function CategoryScreen({ navigation, route }: Props) {
  const category = route.params?.category;
  const isAll = !category || category === 'all';
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { count } = useCart();

  const [heroTitle, setHeroTitle] = useState(route.params?.title || (isAll ? 'All Products' : ''));
  const [heroDescription, setHeroDescription] = useState(
    isAll ? 'Everything currently available in the Mozart Techniques store.' : '',
  );
  const [heroImage, setHeroImage] = useState<string | null>(null);

  const [sort, setSort] = useState<NonNullable<ProductSearchParams['sort']>>('featured');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<StoreProductSummary[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (isAll) return;
    storeApi
      .fetchCategories()
      .then((data) => {
        const cat = data.categories.find((c) => c.key === category);
        if (cat) {
          setHeroTitle(cat.title);
          setHeroDescription(cat.description);
          setHeroImage(cat.image);
        }
      })
      .catch(() => {});
  }, [category, isAll]);

  const load = useCallback(() => {
    setLoading(true);
    storeApi
      .fetchProducts({ category: isAll ? undefined : category, sort })
      .then((data) => {
        setProducts(data.products);
        setTotal(data.total);
      })
      .catch(() => {
        setProducts([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [category, isAll, sort]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={products}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {heroImage ? (
              <ImageBackground source={{ uri: heroImage }} style={styles.hero}>
                <LinearGradient colors={['rgba(5,11,16,0.35)', 'rgba(5,11,16,0.85)']} style={styles.heroOverlay}>
                  <Text style={styles.heroTitle} numberOfLines={2}>{heroTitle}</Text>
                  {heroDescription ? <Text style={styles.heroDescription} numberOfLines={3}>{heroDescription}</Text> : null}
                </LinearGradient>
              </ImageBackground>
            ) : (
              <LinearGradient colors={['#050b10', '#1a0505']} style={styles.hero}>
                <View style={styles.heroOverlay}>
                  <Text style={styles.heroTitle} numberOfLines={2}>{heroTitle}</Text>
                  {heroDescription ? <Text style={styles.heroDescription} numberOfLines={3}>{heroDescription}</Text> : null}
                </View>
              </LinearGradient>
            )}
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
              <Ionicons name="arrow-back" size={18} color="#fff" />
            </Pressable>

            <View style={styles.heroActions}>
              <Pressable style={styles.heroIconBtn} onPress={() => navigation.getParent()?.getParent()?.navigate('StoreProfile')} hitSlop={8}>
                <Ionicons name="bag-outline" size={18} color="#fff" />
              </Pressable>
              <Pressable style={styles.heroIconBtn} onPress={() => navigation.getParent()?.getParent()?.navigate('Cart')} hitSlop={8}>
                <Ionicons name="cart-outline" size={18} color="#fff" />
                {count > 0 ? (
                  <View style={styles.heroCartBadge}>
                    <Text style={styles.heroCartBadgeText}>{count > 99 ? '99+' : count}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <View style={styles.toolbar}>
              <Text style={styles.resultCount}>{loading ? '' : `${total} product${total === 1 ? '' : 's'}`}</Text>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={SORTS}
              keyExtractor={(s) => s.value}
              contentContainerStyle={styles.sortRow}
              renderItem={({ item }) => {
                const active = sort === item.value;
                return (
                  <Pressable style={[styles.sortPill, active && styles.sortPillActive]} onPress={() => setSort(item.value)}>
                    <Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              }}
            />
          </View>
        }
        renderItem={({ item }) => {
          const image = resolveMediaUrl(item.coverImage);
          return (
            <Pressable style={styles.productCard} onPress={() => navigation.navigate('ProductDetail', { slug: item.slug })}>
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
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primaryRed} />
            </View>
          ) : (
            <View style={styles.centered}>
              <Ionicons name="cube-outline" size={28} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>No products here yet</Text>
              <Text style={styles.emptyText}>Try another category or check back soon.</Text>
            </View>
          )
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    hero: { width: '100%', height: 168 },
    heroOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 30 },
    heroTitle: { color: '#fff', fontSize: 18, fontFamily: fonts.displayBlack, textAlign: 'center', marginBottom: 6 },
    heroDescription: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: fonts.body, textAlign: 'center', lineHeight: 17 },
    backBtn: {
      position: 'absolute',
      top: 54,
      left: 16,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroActions: {
      position: 'absolute',
      top: 54,
      right: 16,
      flexDirection: 'row',
      gap: 8,
    },
    heroIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroCartBadge: {
      position: 'absolute', top: 1, right: 1, minWidth: 15, height: 15, borderRadius: 8,
      backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    heroCartBadgeText: { color: colors.onPrimary, fontSize: 9, fontFamily: fonts.bodyBold },
    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
    resultCount: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint },
    sortRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
    sortPill: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    sortPillActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    sortPillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    sortPillTextActive: { color: colors.onPrimary },
    centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 40, gap: 8 },
    emptyTitle: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 12.5 },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    productRow: { gap: 12, paddingHorizontal: 4 },
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
