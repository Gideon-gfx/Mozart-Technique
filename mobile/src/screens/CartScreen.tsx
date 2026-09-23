import { FlatList } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { openBrowser } from '../utils/openBrowser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../api/client';
import * as storeApi from '../api/store';
import type { StoreAddress, StoreProductBatchItem } from '../api/types';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useCart } from '../context/CartContext';
import type { CartItem } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'Cart'>;

interface LiveCartLine extends CartItem {
  active: boolean;
  stockForViewerCountry: number;
}

// Mirrors cart.html: live stock/price refresh on open (same
// /api/store/products/batch endpoint), quantity controls, then checkout -
// pick a saved address, POST /api/store/checkout, open the returned Stripe
// URL in an in-app browser (the native equivalent of the web version's
// window.location.href hand-off to Stripe Checkout).
export default function CartScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const { items, removeItem, setQuantity } = useCart();

  const [liveItems, setLiveItems] = useState<LiveCartLine[]>([]);
  const [refreshing, setRefreshing] = useState(true);
  const [checkoutStep, setCheckoutStep] = useState<'closed' | 'loading' | 'need-address' | 'confirm' | 'starting'>('closed');
  const [addresses, setAddresses] = useState<StoreAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);

  const refreshLive = useCallback(() => {
    if (!items.length) {
      setLiveItems([]);
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    storeApi
      .fetchProductsBatch(items.map((i) => ({ productId: i.productId, colorId: i.colorId })))
      .then((data) => {
        setLiveItems(
          items.map((item, i) => {
            const live: StoreProductBatchItem | undefined = data.items[i];
            return {
              ...item,
              productName: live?.productName || item.productName,
              image: live?.image ?? item.image,
              colorName: live?.colorName || item.colorName,
              colorHex: live?.colorHex || item.colorHex,
              unitPriceLocal: live?.unitPriceLocal ?? item.unitPriceLocal,
              currency: live?.currency || item.currency,
              symbol: live?.symbol || item.symbol,
              active: Boolean(live?.active),
              stockForViewerCountry: live?.stockForViewerCountry ?? 0,
            };
          }),
        );
      })
      .catch(() => setLiveItems(items.map((item) => ({ ...item, active: false, stockForViewerCountry: 0 }))))
      .finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    refreshLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // liveItems is only re-fetched when the number of distinct lines changes
  // (see the items.length effect above) - it does NOT re-run on a plain
  // quantity change, so its own .quantity goes stale the instant +/- is
  // tapped. Quantity's source of truth is always the CartContext items
  // array (updates instantly, no network round-trip needed); liveItems
  // only supplies price/stock/name/image that genuinely needs a live check.
  const displayItems = useMemo(
    () => liveItems.map((li) => {
      const current = items.find((i) => i.productId === li.productId && i.colorId === li.colorId);
      return current ? { ...li, quantity: current.quantity } : li;
    }),
    [liveItems, items],
  );
  const validItems = displayItems.filter((i) => i.active && i.stockForViewerCountry > 0);
  const total = validItems.reduce((sum, i) => sum + i.unitPriceLocal * i.quantity, 0);

  async function startCheckout() {
    setCheckoutStep('loading');
    try {
      const data = await storeApi.fetchAddresses();
      if (!data.addresses.length) {
        setCheckoutStep('need-address');
        return;
      }
      setAddresses(data.addresses);
      setSelectedAddressId((data.addresses.find((a) => a.isDefault) || data.addresses[0]).id);
      setCheckoutStep('confirm');
    } catch {
      toast('Could not start checkout. Try again.', 'error');
      setCheckoutStep('closed');
    }
  }

  async function submitCheckout() {
    if (!selectedAddressId) return;
    setCheckoutStep('starting');
    try {
      const data = await storeApi.checkout(
        validItems.map((i) => ({ productId: i.productId, colorId: i.colorId, quantity: i.quantity })),
        selectedAddressId,
      );
      setCheckoutStep('closed');
      await openBrowser(data.url);
      toast('Check Store Profile > Orders to see your order status.', 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Please try again.', 'error');
      setCheckoutStep('closed');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Your Cart</Text>
        <View style={{ width: 36 }} />
      </View>

      {refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="cart-outline" size={32} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyBody}>Browse the store to find something for your practice.</Text>
          <PrimaryButton title="Continue Shopping" onPress={() => navigation.goBack()} style={styles.continueBtn} />
        </View>
      ) : (
        <>
          <FlatList
            data={displayItems}
            keyExtractor={(item) => `${item.productId}__${item.colorId}`}
            contentContainerStyle={styles.content}
            renderItem={({ item }) => {
              const image = resolveMediaUrl(item.image);
              const unavailable = !item.active || item.stockForViewerCountry <= 0;
              return (
                <View style={styles.row}>
                  {image ? <Image source={{ uri: image }} style={styles.rowImage} /> : <View style={[styles.rowImage, styles.rowImagePlaceholder]} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.productName}</Text>
                    <View style={styles.rowMetaRow}>
                      {item.colorHex ? <View style={[styles.colorDot, { backgroundColor: item.colorHex }]} /> : null}
                      <Text style={styles.rowMeta}>{item.colorName}</Text>
                      <Text style={styles.rowMeta}>·</Text>
                      <Text style={styles.rowMeta}>{item.symbol}{item.unitPriceLocal.toFixed(2)} {item.currency}</Text>
                    </View>
                    {unavailable ? (
                      <Pressable onPress={() => removeItem(item.productId, item.colorId)}>
                        <Text style={styles.rowWarning}>
                          <Ionicons name="warning" size={11} color={colors.danger} /> {item.active ? 'Out of stock for your country' : 'No longer available'} - remove
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={styles.qtyControl}>
                        <Pressable style={styles.qtyBtn} onPress={() => setQuantity(item.productId, item.colorId, item.quantity - 1)}>
                          <Text style={styles.qtyBtnText}>−</Text>
                        </Pressable>
                        <Text style={styles.qtyValue}>{item.quantity}</Text>
                        <Pressable
                          style={styles.qtyBtn}
                          onPress={() => setQuantity(item.productId, item.colorId, Math.min(item.stockForViewerCountry, item.quantity + 1))}
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  <View style={styles.rowEnd}>
                    <Pressable onPress={() => removeItem(item.productId, item.colorId)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={colors.textFaint} />
                    </Pressable>
                    <Text style={styles.rowTotal}>{item.symbol}{(item.unitPriceLocal * item.quantity).toFixed(2)}</Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items</Text>
              <Text style={styles.summaryValue}>{validItems.reduce((s, i) => s + i.quantity, 0)}</Text>
            </View>
            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>Total</Text>
              <Text style={styles.summaryTotalValue}>{validItems[0] ? `${validItems[0].symbol}${total.toFixed(2)}` : '-'}</Text>
            </View>
            <PrimaryButton title="Proceed to Checkout" onPress={startCheckout} disabled={!validItems.length} />
            <Text style={styles.secureNote}>Secure checkout powered by Stripe.</Text>
          </View>
        </>
      )}

      <Modal visible={checkoutStep !== 'closed'} transparent animationType="fade" onRequestClose={() => setCheckoutStep('closed')}>
        <Pressable style={styles.modalBackdrop} onPress={() => checkoutStep !== 'starting' && setCheckoutStep('closed')}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {checkoutStep === 'loading' ? (
              <>
                <ActivityIndicator color={colors.primaryRed} />
                <Text style={styles.modalText}>Checking your delivery details...</Text>
              </>
            ) : checkoutStep === 'need-address' ? (
              <>
                <Ionicons name="location-outline" size={26} color={colors.primaryRed} />
                <Text style={styles.modalTitle}>Add a delivery address</Text>
                <Text style={styles.modalText}>You need a saved delivery address before checking out.</Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancelBtn} onPress={() => setCheckoutStep('closed')}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <PrimaryButton
                    title="Add Address"
                    onPress={() => { setCheckoutStep('closed'); navigation.navigate('StoreProfile', { initialTab: 'addresses' }); }}
                    style={styles.modalPrimaryBtn}
                  />
                </View>
              </>
            ) : checkoutStep === 'confirm' || checkoutStep === 'starting' ? (
              <>
                <Ionicons name="help-circle-outline" size={26} color={colors.primaryRed} />
                <Text style={styles.modalTitle}>Proceed to checkout?</Text>
                <Text style={styles.modalText}>
                  You&apos;re about to pay <Text style={{ fontFamily: fonts.bodyBold }}>{validItems[0]?.symbol}{total.toFixed(2)}</Text>. Confirm your delivery address below.
                </Text>
                <View style={styles.addressList}>
                  {addresses.map((a) => {
                    const active = a.id === selectedAddressId;
                    return (
                      <Pressable key={a.id} style={[styles.addressRow, active && styles.addressRowActive]} onPress={() => setSelectedAddressId(a.id)}>
                        <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={16} color={active ? colors.primaryRed : colors.textFaint} />
                        <Text style={styles.addressText} numberOfLines={2}>{a.label} - {a.fullName}, {a.city}, {a.countryName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancelBtn} onPress={() => setCheckoutStep('closed')} disabled={checkoutStep === 'starting'}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <PrimaryButton title="Proceed" onPress={submitCheckout} loading={checkoutStep === 'starting'} style={styles.modalPrimaryBtn} />
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
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
    title: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 8 },
    emptyTitle: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 4 },
    emptyBody: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center' },
    continueBtn: { marginTop: 14, minWidth: 200 },
    content: { paddingHorizontal: 20, paddingBottom: 12 },
    row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'flex-start' },
    rowImage: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surface },
    rowImagePlaceholder: {},
    rowName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 4 },
    rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    colorDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
    rowMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint },
    rowWarning: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.danger },
    qtyControl: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 999, alignSelf: 'flex-start' },
    qtyBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    qtyBtnText: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    qtyValue: { width: 28, textAlign: 'center', fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text },
    rowEnd: { alignItems: 'flex-end', gap: 10 },
    rowTotal: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    summary: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    summaryLabel: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    summaryValue: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    summaryTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
    summaryTotalLabel: { fontSize: 15, fontFamily: fonts.bodyBold, color: colors.text },
    summaryTotalValue: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text },
    secureNote: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 10 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: 18, padding: 22, alignItems: 'center' },
    modalTitle: { fontSize: 15.5, fontFamily: fonts.displayBlack, color: colors.text, marginTop: 10, marginBottom: 4, textAlign: 'center' },
    modalText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', lineHeight: 18, marginTop: 8 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 18, width: '100%' },
    modalCancelBtn: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
    modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    modalPrimaryBtn: { flex: 1 },
    addressList: { width: '100%', marginTop: 14, gap: 8 },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
    },
    addressRowActive: { borderColor: colors.primaryRed, backgroundColor: `${colors.primaryRed}0D` },
    addressText: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: colors.text, lineHeight: 16 },
  });
}
