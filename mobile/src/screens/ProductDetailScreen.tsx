import { FlatList, ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../api/client';
import * as storeApi from '../api/store';
import type { StoreColor, StoreProductDetail, StoreProductReview, StoreProductSummary } from '../api/types';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import type { StoreStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<StoreStackParamList, 'ProductDetail'>;

function stars(rating: number | null) {
  const full = Math.round(rating || 0);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

// Mirrors product.html card-for-card: gallery + thumbnails, color swatches
// with per-country stock, quantity stepper, add to cart (real CartContext,
// checked out for real via CartScreen), description with read-more,
// related products, and a full review thread (write/edit/delete your own,
// see admin replies) via the real /api/store endpoints.
export default function ProductDetailScreen({ navigation, route }: Props) {
  const { slug } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const { addItem, count } = useCart();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<StoreProductDetail | null>(null);
  const [related, setRelated] = useState<StoreProductSummary[]>([]);
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [descExpanded, setDescExpanded] = useState(false);

  const [reviews, setReviews] = useState<StoreProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    setLoading(true);
    storeApi
      .fetchProductBySlug(slug)
      .then((data) => {
        setProduct(data.product);
        setRelated(data.related);
        const firstInStock = data.product.colors.find((c) => c.stockForViewerCountry > 0);
        setSelectedColorId((firstInStock || data.product.colors[0])?.id ?? null);
        setError(null);
        storeApi.recordRecentlyViewed(data.product.id).catch(() => {});
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this product.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const loadReviews = useCallback((productId: number) => {
    setReviewsLoading(true);
    storeApi
      .fetchProductReviews(productId)
      .then((data) => {
        setReviews(data.reviews);
        const mine = user ? data.reviews.find((r) => r.userId === user.id) : null;
        if (mine) {
          setReviewRating(mine.rating);
          setReviewText(mine.text);
        }
      })
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [user]);

  useEffect(() => {
    if (product) loadReviews(product.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const images = useMemo(() => {
    if (!product) return [];
    return product.images && product.images.length ? product.images : [product.coverImage].filter(Boolean) as string[];
  }, [product]);
  const resolvedImages = images.map((img) => resolveMediaUrl(img)).filter(Boolean) as string[];

  const selectedColor = product?.colors.find((c) => c.id === selectedColorId) || null;
  const myReview = user ? reviews.find((r) => r.userId === user.id) : null;
  const otherReviews = reviews.filter((r) => r !== myReview);

  function onSelectColor(color: StoreColor) {
    setSelectedColorId(color.id);
    setQuantity((q) => Math.min(q, Math.max(1, color.stockForViewerCountry)));
  }

  function onAddToCart() {
    if (!product || !selectedColor || selectedColor.stockForViewerCountry <= 0) return;
    addItem(
      {
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        colorId: selectedColor.id,
        colorName: selectedColor.name,
        colorHex: selectedColor.hex,
        image: product.coverImage,
        unitPriceLocal: product.priceLocal,
        currency: product.currency,
        symbol: product.symbol,
      },
      quantity,
    );
    toast('Added to cart.', 'success');
  }

  async function submitReview() {
    if (!product) return;
    const text = reviewText.trim();
    if (!text) {
      toast('Please write something first.', 'error');
      return;
    }
    setSavingReview(true);
    try {
      if (myReview) await storeApi.updateProductReview(myReview.id, reviewRating, text);
      else await storeApi.submitProductReview(product.id, reviewRating, text);
      toast('Review saved.', 'success');
      loadReviews(product.id);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your review.', 'error');
    } finally {
      setSavingReview(false);
    }
  }

  async function deleteReview() {
    if (!myReview || !product) return;
    try {
      await storeApi.deleteReview(myReview.id);
      setReviewRating(5);
      setReviewText('');
      toast('Review deleted.', 'success');
      loadReviews(product.id);
    } catch {
      toast('Could not delete your review.', 'error');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle} numberOfLines={1}>{product?.name || 'Product'}</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIconBtn} onPress={() => navigation.getParent()?.getParent()?.navigate('StoreProfile')} hitSlop={8}>
            <Ionicons name="bag-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable style={styles.headerIconBtn} onPress={() => navigation.getParent()?.getParent()?.navigate('Cart')} hitSlop={8}>
            <Ionicons name="cart-outline" size={20} color={colors.text} />
            {count > 0 ? (
              <View style={styles.headerCartBadge}>
                <Text style={styles.headerCartBadgeText}>{count > 99 ? '99+' : count}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error || !product ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.textFaint} />
          <Text style={styles.emptyText}>{error || "We couldn't find that product."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View>
            <Pressable onPress={() => setLightboxOpen(true)}>
              {resolvedImages[imageIndex] ? (
                <Image source={{ uri: resolvedImages[imageIndex] }} style={styles.galleryMain} />
              ) : (
                <View style={[styles.galleryMain, styles.galleryPlaceholder]} />
              )}
            </Pressable>
            {resolvedImages.length > 1 ? (
              <>
                <Pressable
                  style={[styles.galleryNav, styles.galleryNavPrev]}
                  onPress={() => setImageIndex((i) => (i - 1 + resolvedImages.length) % resolvedImages.length)}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-back" size={16} color="#241f1c" />
                </Pressable>
                <Pressable
                  style={[styles.galleryNav, styles.galleryNavNext]}
                  onPress={() => setImageIndex((i) => (i + 1) % resolvedImages.length)}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-forward" size={16} color="#241f1c" />
                </Pressable>
              </>
            ) : null}
          </View>
          {resolvedImages.length > 1 ? (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={resolvedImages}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.thumbRow}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => setImageIndex(index)}>
                  <Image source={{ uri: item }} style={[styles.thumb, index === imageIndex && styles.thumbActive]} />
                </Pressable>
              )}
            />
          ) : null}

          <Text style={styles.category}>{product.category.replace(/-/g, ' ')}</Text>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.ratingLine}>
            {stars(product.avgRating)} <Text style={styles.ratingCount}>{product.avgRating || 0} ({product.reviewCount} review{product.reviewCount === 1 ? '' : 's'})</Text>
          </Text>
          <Text style={styles.price}>{product.symbol}{product.priceLocal.toFixed(2)} <Text style={styles.currency}>{product.currency}</Text></Text>

          {product.colors.length ? (
            <View style={styles.colorSection}>
              <Text style={styles.fieldLabel}>Color: <Text style={styles.colorName}>{selectedColor?.name}</Text></Text>
              <View style={styles.colorRow}>
                {product.colors.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => onSelectColor(c)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c.hex },
                      c.id === selectedColorId && styles.colorSwatchActive,
                      c.stockForViewerCountry <= 0 && styles.colorSwatchUnavailable,
                    ]}
                  />
                ))}
              </View>
              {selectedColor ? (
                selectedColor.stockForViewerCountry > 0 ? (
                  <Text style={styles.stockOk}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} /> {selectedColor.stockForViewerCountry} in stock for delivery to your country
                  </Text>
                ) : (
                  <Text style={styles.stockBad}>
                    <Ionicons name="alert-circle" size={13} color={colors.danger} /> Not currently available for delivery to your country
                  </Text>
                )
              ) : null}
            </View>
          ) : null}

          <View style={styles.qtyRow}>
            <Text style={styles.fieldLabel}>Quantity</Text>
            <View style={styles.qtyControl}>
              <Pressable style={styles.qtyBtn} onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.min(selectedColor?.stockForViewerCountry || 99, q + 1))}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
          </View>

          <PrimaryButton
            title="Add to Cart"
            onPress={onAddToCart}
            disabled={!selectedColor || selectedColor.stockForViewerCountry <= 0}
            style={styles.addToCartBtn}
          />

          <View style={styles.descCard}>
            <Text style={[styles.description, !descExpanded && styles.descriptionClamped]} numberOfLines={descExpanded ? undefined : 5}>
              {product.description}
            </Text>
            <Pressable onPress={() => setDescExpanded((v) => !v)}>
              <Text style={styles.descToggle}>{descExpanded ? 'Read less' : 'Read more'}</Text>
            </Pressable>
          </View>

          {related.length ? (
            <View style={styles.relatedSection}>
              <Text style={styles.sectionTitle}>You may also like</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={related}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.relatedRow}
                renderItem={({ item }) => {
                  const img = resolveMediaUrl(item.coverImage);
                  return (
                    <Pressable style={styles.relatedCard} onPress={() => navigation.push('ProductDetail', { slug: item.slug })}>
                      {img ? <Image source={{ uri: img }} style={styles.relatedImage} /> : <View style={[styles.relatedImage, styles.galleryPlaceholder]} />}
                      <Text style={styles.relatedName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.relatedPrice}>{item.symbol}{item.priceLocal.toFixed(2)}</Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          ) : null}

          <View style={styles.reviewsSection}>
            <Text style={styles.sectionTitle}>Reviews</Text>

            {user ? (
              <View style={styles.reviewFormCard}>
                <Text style={styles.reviewFormTitle}>{myReview ? 'Edit your review' : 'Write a review'}</Text>
                <View style={styles.starPicker}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setReviewRating(n)} hitSlop={4}>
                      <Ionicons name={n <= reviewRating ? 'star' : 'star-outline'} size={22} color="#f5a623" />
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.reviewInput}
                  value={reviewText}
                  onChangeText={setReviewText}
                  placeholder="Share your thoughts on this product..."
                  placeholderTextColor={colors.textFaint}
                  multiline
                />
                <View style={styles.reviewFormActions}>
                  <PrimaryButton
                    title={myReview ? 'Update review' : 'Submit review'}
                    onPress={submitReview}
                    loading={savingReview}
                    style={styles.reviewSubmitBtn}
                  />
                  {myReview ? (
                    <Pressable style={styles.reviewDeleteBtn} onPress={deleteReview}>
                      <Text style={styles.reviewDeleteText}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : (
              <Text style={styles.signInHint}>Sign in to write a review.</Text>
            )}

            {reviewsLoading ? (
              <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 12 }} />
            ) : reviews.length === 0 ? (
              <Text style={styles.noReviews}>No reviews yet - be the first.</Text>
            ) : (
              <View style={styles.reviewsList}>
                {[myReview, ...otherReviews].filter(Boolean).map((r, i) => (
                  <ReviewRow key={r!.id} review={r!} colors={colors} divider={i > 0} />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={lightboxOpen} transparent animationType="fade" onRequestClose={() => setLightboxOpen(false)}>
        <Pressable style={styles.lightbox} onPress={() => setLightboxOpen(false)}>
          {resolvedImages[imageIndex] ? <Image source={{ uri: resolvedImages[imageIndex] }} style={styles.lightboxImage} resizeMode="contain" /> : null}
          {resolvedImages.length > 1 ? (
            <>
              <Pressable
                style={[styles.lightboxNav, styles.lightboxNavPrev]}
                onPress={(e) => { e.stopPropagation(); setImageIndex((i) => (i - 1 + resolvedImages.length) % resolvedImages.length); }}
                hitSlop={10}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.lightboxNav, styles.lightboxNavNext]}
                onPress={(e) => { e.stopPropagation(); setImageIndex((i) => (i + 1) % resolvedImages.length); }}
                hitSlop={10}
              >
                <Ionicons name="chevron-forward" size={22} color="#fff" />
              </Pressable>
            </>
          ) : null}
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxOpen(false)} hitSlop={10}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.lightboxCounter}>{imageIndex + 1} / {resolvedImages.length}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

function ReviewRow({ review, colors, divider }: { review: StoreProductReview; colors: ThemeColors; divider: boolean }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const initials = (review.userName || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.reviewRow, divider && styles.reviewRowDivider]}>
      <View style={styles.reviewHead}>
        <View style={styles.reviewAvatar}>
          <Text style={styles.reviewAvatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewAuthor}>{review.userName}</Text>
          <Text style={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString()}{review.editedAt ? ' (edited)' : ''}</Text>
        </View>
        <Text style={styles.reviewStars}>{stars(review.rating)}</Text>
      </View>
      <Text style={styles.reviewText}>{review.text}</Text>
      {review.replies.map((reply) => (
        <View key={reply.id} style={styles.reviewReply}>
          <Text style={styles.reviewReplyText}>
            <Text style={styles.reviewReplyAuthor}>{reply.adminName}: </Text>
            {reply.text}
          </Text>
        </View>
      ))}
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
      gap: 10,
    },
    headerTitle: { flex: 1, fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerCartBadge: {
      position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 8,
      backgroundColor: colors.primaryRed, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    headerCartBadgeText: { color: colors.onPrimary, fontSize: 9, fontFamily: fonts.bodyBold },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 8 },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 13 },
    content: { paddingHorizontal: 20, paddingBottom: 48 },
    galleryMain: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: colors.surface },
    galleryNav: {
      position: 'absolute',
      top: '50%',
      marginTop: -18,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.9)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    galleryNavPrev: { left: 12 },
    galleryNavNext: { right: 12 },
    galleryPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    thumbRow: { gap: 8, marginTop: 10 },
    thumb: { width: 56, height: 56, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
    thumbActive: { borderColor: colors.primaryRed },
    category: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.primaryRed, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 18 },
    name: { fontSize: 19, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 4, lineHeight: 25 },
    ratingLine: { fontSize: 12, color: '#f5a623', marginTop: 8 },
    ratingCount: { color: colors.textFaint, fontFamily: fonts.body },
    price: { fontSize: 19, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 10 },
    currency: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint },
    fieldLabel: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    colorSection: { marginTop: 18 },
    colorName: { color: colors.textFaint, fontFamily: fonts.body },
    colorRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    colorSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
    colorSwatchActive: { borderColor: colors.primaryRed },
    colorSwatchUnavailable: { opacity: 0.3 },
    stockOk: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.success, marginTop: 8 },
    stockBad: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.danger, marginTop: 8 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
    qtyControl: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 999, overflow: 'hidden' },
    qtyBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    qtyBtnText: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    qtyValue: { width: 36, textAlign: 'center', fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    addToCartBtn: { marginTop: 18 },
    descCard: {
      marginTop: 22,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    description: { fontSize: 13, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 19 },
    descriptionClamped: {},
    descToggle: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed, marginTop: 8 },
    sectionTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 12 },
    relatedSection: { marginTop: 28 },
    relatedRow: { gap: 12 },
    relatedCard: { width: 120 },
    relatedImage: { width: 120, height: 120, borderRadius: 12, backgroundColor: colors.surface, marginBottom: 6 },
    relatedName: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text, lineHeight: 15 },
    relatedPrice: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 2 },
    reviewsSection: { marginTop: 28 },
    reviewFormCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 16,
    },
    reviewFormTitle: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 8 },
    starPicker: { flexDirection: 'row', gap: 6 },
    reviewInput: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.text,
      minHeight: 70,
      textAlignVertical: 'top',
    },
    reviewFormActions: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' },
    reviewSubmitBtn: { flex: 1 },
    reviewDeleteBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: `${colors.danger}17` },
    reviewDeleteText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.danger },
    signInHint: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, marginBottom: 12 },
    noReviews: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    reviewsList: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    reviewRow: { paddingVertical: 14 },
    reviewRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    reviewAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primaryRed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewAvatarText: { color: '#fff', fontSize: 12, fontFamily: fonts.bodyBold },
    reviewAuthor: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    reviewDate: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    reviewStars: { fontSize: 11, color: '#f5a623' },
    reviewText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 18 },
    reviewReply: { marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: colors.background },
    reviewReplyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textSoft, lineHeight: 17 },
    reviewReplyAuthor: { fontFamily: fonts.bodyBold, color: colors.primaryRed },
    lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    lightboxImage: { width: Dimensions.get('window').width, height: '80%' },
    lightboxCounter: { position: 'absolute', bottom: 30, color: '#fff', fontSize: 12, fontFamily: fonts.body },
    lightboxClose: { position: 'absolute', top: 56, right: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    lightboxNav: { position: 'absolute', top: '50%', marginTop: -20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    lightboxNavPrev: { left: 8 },
    lightboxNavNext: { right: 8 },
  });
}
