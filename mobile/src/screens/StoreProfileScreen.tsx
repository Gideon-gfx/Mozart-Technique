import { FlatList, ScrollView } from '../components/LiquidScroll';
import Pressable from '../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View,  } from 'react-native';

import * as geoApi from '../api/geo';
import * as notificationsApi from '../api/notifications';
import * as storeApi from '../api/store';
import type { AddressPayload } from '../api/store';
import type { AppNotification, StoreAddress, StoreInboxEntry, StoreOrder, StoreOrderStatus, StoreProductSummary, StoreReview } from '../api/types';
import Avatar from '../components/Avatar';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { MainStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'StoreProfile'>;

type TabKey = 'orders' | 'inbox' | 'ratings' | 'recently-viewed' | 'addresses' | 'notifications';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'orders', label: 'Orders', icon: 'cube' },
  { key: 'inbox', label: 'Inbox', icon: 'mail' },
  { key: 'ratings', label: 'Ratings', icon: 'star' },
  { key: 'recently-viewed', label: 'Recently Viewed', icon: 'time' },
  { key: 'addresses', label: 'Address Book', icon: 'location' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications' },
];

const ONGOING: StoreOrderStatus[] = ['paid', 'processing', 'shipped', 'payment_flagged'];
const COMPLETED: StoreOrderStatus[] = ['delivered'];
const CANCELLED: StoreOrderStatus[] = ['cancelled'];

// Native rebuild of store-profile.html - same 6 tabs, same
// /api/store/* endpoints, real data throughout. Reached from the Profile
// menu's "Store Profile" row, not a web redirect.
export default function StoreProfileScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<TabKey>(route.params?.initialTab || 'orders');

  if (!user) return null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Store Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.profileRow}>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={52} />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>Welcome, {user.name}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
      </View>

      <View style={styles.tabBarWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TABS}
          keyExtractor={(t) => t.key}
          contentContainerStyle={styles.tabBarContent}
          renderItem={({ item }) => {
            const active = tab === item.key;
            return (
              <Pressable style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={() => setTab(item.key)}>
                <Ionicons name={item.icon} size={13} color={active ? colors.onPrimary : colors.textSoft} />
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={styles.tabContent}>
        {tab === 'orders' ? <OrdersTab colors={colors} /> : null}
        {tab === 'inbox' ? <InboxTab colors={colors} /> : null}
        {tab === 'ratings' ? <RatingsTab colors={colors} /> : null}
        {tab === 'recently-viewed' ? <RecentlyViewedTab colors={colors} /> : null}
        {tab === 'addresses' ? <AddressesTab colors={colors} /> : null}
        {tab === 'notifications' ? <NotificationsTab colors={colors} /> : null}
      </View>
    </View>
  );
}

function EmptyState({ icon, title, body, colors }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={26} color={colors.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function ErrorState({ message, colors }: { message: string; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// --- Orders ---

const ORDER_STATUS_META: Record<StoreOrderStatus, { label: string; bg: (c: ThemeColors) => string; fg: (c: ThemeColors) => string }> = {
  pending_payment: { label: 'Pending payment', bg: (c) => c.border, fg: (c) => c.textSoft },
  paid: { label: 'Paid', bg: (c) => c.statusPendingBg, fg: (c) => c.statusPendingText },
  processing: { label: 'Processing', bg: (c) => c.statusPendingBg, fg: (c) => c.statusPendingText },
  shipped: { label: 'Shipped', bg: (c) => c.statusPendingBg, fg: (c) => c.statusPendingText },
  delivered: { label: 'Delivered', bg: (c) => c.statusActiveBg, fg: (c) => c.statusActiveText },
  cancelled: { label: 'Cancelled', bg: (c) => 'rgba(220,38,38,0.12)', fg: (c) => c.danger },
  payment_flagged: { label: 'Processing', bg: (c) => c.statusPendingBg, fg: (c) => c.statusPendingText },
};

function OrdersTab({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [segment, setSegment] = useState<'ongoing' | 'completed' | 'cancelled'>('ongoing');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    storeApi
      .fetchOrders()
      .then((data) => setOrders(data.orders))
      .catch(() => setError('Could not load your orders.'))
      .finally(() => setLoading(false));
  }, []);

  const groups: Record<string, StoreOrderStatus[]> = { ongoing: ONGOING, completed: COMPLETED, cancelled: CANCELLED };
  const filtered = orders.filter((o) => groups[segment].includes(o.status));

  if (loading) return <ActivityIndicator color={colors.primaryRed} style={styles.loadingSpinner} />;
  if (error) return <ErrorState message={error} colors={colors} />;

  return (
    <View>
      <View style={styles.segmentedRow}>
        {(['ongoing', 'completed', 'cancelled'] as const).map((s) => {
          const active = segment === s;
          return (
            <Pressable key={s} style={[styles.segmentBtn, active && styles.segmentBtnActive]} onPress={() => setSegment(s)}>
              <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                {s === 'ongoing' ? 'Ongoing' : s === 'completed' ? 'Completed' : 'Cancelled'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon="cube-outline" title="No orders here" body="Orders you place will show up here." colors={colors} />
      ) : (
        filtered.map((order) => (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.orderCardHead}>
              <View>
                <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: ORDER_STATUS_META[order.status].bg(colors) }]}>
                <Text style={[styles.badgeText, { color: ORDER_STATUS_META[order.status].fg(colors) }]}>
                  {ORDER_STATUS_META[order.status].label}
                </Text>
              </View>
            </View>

            {order.items.length ? (
              <View style={styles.orderThumbs}>
                {order.items.map((item, i) =>
                  item.image ? <Image key={i} source={{ uri: item.image }} style={styles.orderThumb} /> : null,
                )}
              </View>
            ) : null}

            <View style={styles.orderFootRow}>
              <Text style={styles.orderMuted}>{order.items.length} item{order.items.length === 1 ? '' : 's'}</Text>
              <Text style={styles.orderTotal}>${Number(order.totalUsd).toFixed(2)}</Text>
            </View>

            <Pressable style={styles.timelineToggle} onPress={() => setExpanded(expanded === order.id ? null : order.id)}>
              <Text style={styles.timelineToggleText}>View timeline</Text>
              <Ionicons name={expanded === order.id ? 'chevron-up' : 'chevron-down'} size={13} color={colors.primaryRed} />
            </Pressable>

            {expanded === order.id ? (
              <View style={styles.timeline}>
                {order.statusHistory.map((h, i) => (
                  <View key={i} style={styles.timelineItem}>
                    <View style={styles.timelineDot} />
                    <View style={styles.timelineBody}>
                      <Text style={styles.timelineStatus}>{h.status.replace(/_/g, ' ')}</Text>
                      <Text style={styles.timelineMessage}>{h.message}</Text>
                      <Text style={styles.timelineTime}>{new Date(h.at).toLocaleString()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

// --- Inbox ---

const INBOX_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  paid: 'card',
  processing: 'cube',
  shipped: 'rocket',
  delivered: 'checkmark-circle',
  cancelled: 'close-circle',
  payment_flagged: 'warning',
};

function InboxTab({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [inbox, setInbox] = useState<StoreInboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storeApi
      .fetchInbox()
      .then((data) => setInbox(data.inbox))
      .catch(() => setError('Could not load your inbox.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator color={colors.primaryRed} style={styles.loadingSpinner} />;
  if (error) return <ErrorState message={error} colors={colors} />;
  if (inbox.length === 0) return <EmptyState icon="mail-outline" title="Nothing here yet" body="Delivery updates about your orders will appear here." colors={colors} />;

  return (
    <View style={styles.card}>
      {inbox.map((item, i) => (
        <View key={i} style={[styles.inboxRow, i > 0 && styles.rowDivider]}>
          <View style={styles.inboxIcon}>
            <Ionicons name={INBOX_ICONS[item.status] || 'information-circle'} size={16} color={colors.primaryRed} />
          </View>
          <View style={styles.inboxBody}>
            <Text style={styles.inboxOrder}>{item.orderNumber}</Text>
            <Text style={styles.inboxMessage}>{item.message}</Text>
            <Text style={styles.inboxTime}>{new Date(item.at).toLocaleString()}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// --- Ratings ---

function RatingsTab({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    storeApi
      .fetchMyReviews()
      .then((data) => { setReviews(data.reviews); setError(null); })
      .catch(() => setError('Could not load your reviews.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onDelete(id: number) {
    const ok = await confirm({ message: 'Delete this review?', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await storeApi.deleteReview(id);
      load();
    } catch {
      toast('Could not delete that review.', 'error');
    }
  }

  if (loading) return <ActivityIndicator color={colors.primaryRed} style={styles.loadingSpinner} />;
  if (error) return <ErrorState message={error} colors={colors} />;
  if (reviews.length === 0) return <EmptyState icon="star-outline" title="No reviews yet" body="Reviews you write on products will show up here." colors={colors} />;

  return (
    <View style={styles.card}>
      {reviews.map((r, i) => (
        <View key={r.id} style={[styles.reviewRow, i > 0 && styles.rowDivider]}>
          {r.productImage ? <Image source={{ uri: r.productImage }} style={styles.reviewImage} /> : <View style={styles.reviewImage} />}
          <View style={styles.reviewBody}>
            <Text style={styles.reviewProduct}>{r.productName}</Text>
            <View style={styles.reviewStars}>
              {Array.from({ length: 5 }).map((_, s) => (
                <Ionicons key={s} name="star" size={12} color={s < r.rating ? '#F5A623' : colors.border} />
              ))}
            </View>
            <Text style={styles.reviewText}>{r.text}</Text>
            {r.replies.map((reply) => (
              <View key={reply.id} style={styles.reviewReply}>
                <Text style={styles.reviewReplyAuthor}>{reply.adminName}: </Text>
                <Text style={styles.reviewReplyText}>{reply.text}</Text>
              </View>
            ))}
            <Pressable style={styles.reviewDeleteBtn} onPress={() => onDelete(r.id)}>
              <Ionicons name="trash-outline" size={13} color={colors.danger} />
              <Text style={styles.reviewDeleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

// --- Recently Viewed ---

function RecentlyViewedTab({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [products, setProducts] = useState<StoreProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storeApi
      .fetchRecentlyViewed()
      .then((data) => setProducts(data.products))
      .catch(() => setError('Could not load recently viewed products.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator color={colors.primaryRed} style={styles.loadingSpinner} />;
  if (error) return <ErrorState message={error} colors={colors} />;
  if (products.length === 0) return <EmptyState icon="time-outline" title="Nothing viewed yet" body="Products you look at will show up here." colors={colors} />;

  return (
    <View style={styles.productGrid}>
      {products.map((p) => (
        <View key={p.id} style={styles.productCard}>
          {p.coverImage ? <Image source={{ uri: p.coverImage }} style={styles.productImage} /> : <View style={styles.productImage} />}
          <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
          <Text style={styles.productPrice}>{p.symbol}{Number(p.priceLocal).toFixed(2)} <Text style={styles.productCurrency}>{p.currency}</Text></Text>
        </View>
      ))}
    </View>
  );
}

// --- Addresses ---

function AddressesTab({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast, confirm } = useToast();
  const [addresses, setAddresses] = useState<StoreAddress[]>([]);
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StoreAddress | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([storeApi.fetchAddresses(), geoApi.fetchGeo()])
      .then(([addrData, geoData]) => {
        setAddresses(addrData.addresses);
        setCountries(geoData.countries);
        setError(null);
      })
      .catch(() => setError('Could not load your addresses.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onDelete(id: number) {
    const ok = await confirm({ message: 'Delete this address?', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await storeApi.deleteAddress(id);
      load();
    } catch {
      toast('Could not delete that address.', 'error');
    }
  }

  async function onSetDefault(id: number) {
    try {
      await storeApi.setDefaultAddress(id);
      load();
    } catch {
      toast('Could not update the default address.', 'error');
    }
  }

  if (loading) return <ActivityIndicator color={colors.primaryRed} style={styles.loadingSpinner} />;
  if (error) return <ErrorState message={error} colors={colors} />;

  return (
    <View>
      <Pressable style={styles.addAddressBtn} onPress={() => setEditing('new')}>
        <Ionicons name="add" size={16} color={colors.onPrimary} />
        <Text style={styles.addAddressBtnText}>Add Address</Text>
      </Pressable>

      {addresses.length === 0 ? (
        <EmptyState icon="location-outline" title="No addresses saved" body="Add a delivery address so you can check out." colors={colors} />
      ) : (
        addresses.map((a) => (
          <View key={a.id} style={styles.addressCard}>
            <View style={styles.addressCardHead}>
              <View style={styles.addressCardInfo}>
                <View style={styles.addressLabelRow}>
                  <Text style={styles.addressLabel}>{a.label}</Text>
                  {a.isDefault ? (
                    <View style={[styles.badge, { backgroundColor: colors.statusActiveBg }]}>
                      <Text style={[styles.badgeText, { color: colors.statusActiveText }]}>Default</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.addressName}>{a.fullName} · {a.phone}</Text>
                <Text style={styles.addressLine}>
                  {a.street}, {a.city}{a.state ? `, ${a.state}` : ''}, {a.countryName} {a.postalCode}
                </Text>
              </View>
              <View style={styles.addressActions}>
                {!a.isDefault ? (
                  <Pressable style={styles.addressActionBtn} onPress={() => onSetDefault(a.id)}>
                    <Text style={styles.addressActionText}>Set Default</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.addressActionBtn} onPress={() => setEditing(a)}>
                  <Text style={styles.addressActionText}>Edit</Text>
                </Pressable>
                <Pressable style={[styles.addressActionBtn, styles.addressActionDanger]} onPress={() => onDelete(a.id)}>
                  <Text style={[styles.addressActionText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}

      <AddressForm
        address={editing === 'new' ? null : editing}
        visible={editing !== null}
        countries={countries}
        colors={colors}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </View>
  );
}

function AddressForm({
  address,
  visible,
  countries,
  colors,
  onClose,
  onSaved,
}: {
  address: StoreAddress | null;
  visible: boolean;
  countries: Array<{ code: string; name: string }>;
  colors: ThemeColors;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [label, setLabel] = useState('Home');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<{ code: string; name: string } | null>(null);
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLabel(address?.label || 'Home');
    setFullName(address?.fullName || '');
    setPhone(address?.phone || '');
    setCountry(address ? { code: address.country, name: address.countryName } : null);
    setState(address?.state || '');
    setCity(address?.city || '');
    setStreet(address?.street || '');
    setPostalCode(address?.postalCode || '');
    setIsDefault(address?.isDefault || false);
    setError(null);
  }, [visible, address]);

  async function save() {
    if (!fullName.trim() || !phone.trim() || !city.trim() || !street.trim() || !country) {
      setError('Fill in name, phone, country, city and street.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: AddressPayload = {
      label: label.trim() || 'Home',
      fullName: fullName.trim(),
      phone: phone.trim(),
      country: country.code,
      countryName: country.name,
      state: state.trim(),
      city: city.trim(),
      street: street.trim(),
      postalCode: postalCode.trim(),
      isDefault,
    };
    try {
      if (address) await storeApi.updateAddress(address.id, payload);
      else await storeApi.createAddress(payload);
      onSaved();
    } catch (err) {
      setError('Could not save that address.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdropTouch} onPress={onClose} />
        <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{address ? 'Edit address' : 'Add address'}</Text>

          <Text style={styles.sheetLabel}>Label</Text>
          <TextInput style={styles.sheetInput} value={label} onChangeText={setLabel} placeholder="Home" placeholderTextColor={colors.textFaint} />

          <Text style={styles.sheetLabel}>Full name</Text>
          <TextInput style={styles.sheetInput} value={fullName} onChangeText={setFullName} placeholderTextColor={colors.textFaint} />

          <Text style={styles.sheetLabel}>Phone</Text>
          <TextInput style={styles.sheetInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.textFaint} />

          <Text style={styles.sheetLabel}>Country</Text>
          <Pressable style={styles.sheetInput} onPress={() => setCountryPickerOpen(true)}>
            <Text style={{ fontSize: 14, fontFamily: fonts.body, color: country ? colors.text : colors.textFaint }}>
              {country?.name || 'Select country'}
            </Text>
          </Pressable>

          <Text style={styles.sheetLabel}>State / Region</Text>
          <TextInput style={styles.sheetInput} value={state} onChangeText={setState} placeholderTextColor={colors.textFaint} />

          <Text style={styles.sheetLabel}>City</Text>
          <TextInput style={styles.sheetInput} value={city} onChangeText={setCity} placeholderTextColor={colors.textFaint} />

          <Text style={styles.sheetLabel}>Street address</Text>
          <TextInput style={styles.sheetInput} value={street} onChangeText={setStreet} placeholderTextColor={colors.textFaint} />

          <Text style={styles.sheetLabel}>Postal code</Text>
          <TextInput style={styles.sheetInput} value={postalCode} onChangeText={setPostalCode} placeholderTextColor={colors.textFaint} />

          <Pressable style={styles.checkboxRow} onPress={() => setIsDefault((v) => !v)}>
            <View style={[styles.checkbox, isDefault && styles.checkboxChecked]}>
              {isDefault ? <Ionicons name="checkmark" size={12} color={colors.onPrimary} /> : null}
            </View>
            <Text style={styles.checkboxLabel}>Set as default address</Text>
          </Pressable>

          {error ? <Text style={styles.sheetError}>{error}</Text> : null}

          <View style={styles.sheetBtnRow}>
            <PrimaryButton title="Save Address" onPress={save} loading={saving} style={{ flex: 1 }} />
            <Pressable style={styles.sheetCancelBtn} onPress={onClose}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>

        <CountryPicker
          visible={countryPickerOpen}
          countries={countries}
          colors={colors}
          onSelect={(c) => { setCountry(c); setCountryPickerOpen(false); }}
          onClose={() => setCountryPickerOpen(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CountryPicker({
  visible,
  countries,
  colors,
  onSelect,
  onClose,
}: {
  visible: boolean;
  countries: Array<{ code: string; name: string }>;
  colors: ThemeColors;
  onSelect: (c: { code: string; name: string }) => void;
  onClose: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const filtered = countries.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetBackdropTouch} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: '75%' }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Select country</Text>
          <TextInput
            style={styles.sheetInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search countries"
            placeholderTextColor={colors.textFaint}
          />
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            renderItem={({ item }) => (
              <Pressable style={styles.countryRow} onPress={() => onSelect(item)}>
                <Text style={styles.countryRowText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// --- Notifications ---

function NotificationsTab({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notificationsApi
      .fetchNotifications()
      .then((data) => setNotifications(data.notifications.filter((n) => (n.type || '').startsWith('store_'))))
      .catch(() => setError('Could not load your notifications.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator color={colors.primaryRed} style={styles.loadingSpinner} />;
  if (error) return <ErrorState message={error} colors={colors} />;
  if (notifications.length === 0) return <EmptyState icon="notifications-outline" title="No notifications yet" body="Updates about your orders and reviews will appear here." colors={colors} />;

  return (
    <View style={styles.card}>
      {notifications.map((n, i) => (
        <View key={n.id} style={[styles.notifRow, i > 0 && styles.rowDivider]}>
          <Ionicons name="information-circle" size={16} color={colors.primaryRed} />
          <View style={styles.notifBody}>
            <Text style={[styles.notifMessage, !n.read && styles.notifUnread]}>{n.message}</Text>
            <Text style={styles.notifTime}>{new Date(n.createdAt).toLocaleString()}</Text>
          </View>
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
      paddingBottom: 14,
    },
    title: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
    headerSpacer: { width: 36 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 15.5, fontFamily: fonts.bodyBold, color: colors.text },
    profileEmail: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    tabBarWrap: { borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 },
    tabBarContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
    tabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    tabBtnActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    tabBtnText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textSoft },
    tabBtnTextActive: { color: colors.onPrimary },
    tabContent: { paddingHorizontal: 20, paddingBottom: 40, flex: 1 },
    loadingSpinner: { marginTop: 30 },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.text },
    emptyBody: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', paddingHorizontal: 20 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    badgeText: { fontSize: 10.5, fontFamily: fonts.bodyBold },
    // Orders
    segmentedRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    segmentBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    segmentBtnActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    segmentBtnText: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.textSoft },
    segmentBtnTextActive: { color: colors.onPrimary },
    orderCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    orderCardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    orderNumber: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    orderDate: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    orderThumbs: { flexDirection: 'row', gap: 8, marginTop: 10 },
    orderThumb: { width: 42, height: 42, borderRadius: 8 },
    orderFootRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    orderMuted: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint },
    orderTotal: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    timelineToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-start' },
    timelineToggleText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    timeline: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed', gap: 12 },
    timelineItem: { flexDirection: 'row', gap: 10 },
    timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryRed, marginTop: 5 },
    timelineBody: { flex: 1 },
    timelineStatus: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.text, textTransform: 'capitalize' },
    timelineMessage: { fontSize: 12, fontFamily: fonts.body, color: colors.textSoft, marginTop: 1 },
    timelineTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 1 },
    // Inbox
    inboxRow: { flexDirection: 'row', gap: 12, paddingVertical: 13 },
    inboxIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inboxBody: { flex: 1 },
    inboxOrder: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.text },
    inboxMessage: { fontSize: 12, fontFamily: fonts.body, color: colors.textSoft, marginTop: 2 },
    inboxTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    // Ratings
    reviewRow: { flexDirection: 'row', gap: 12, paddingVertical: 13 },
    reviewImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.background },
    reviewBody: { flex: 1 },
    reviewProduct: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    reviewStars: { flexDirection: 'row', gap: 1, marginTop: 3 },
    reviewText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 5 },
    reviewReply: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: colors.background,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 6,
    },
    reviewReplyAuthor: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    reviewReplyText: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textSoft },
    reviewDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
    reviewDeleteText: { fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.danger },
    // Recently viewed
    productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    productCard: { width: '47%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 10 },
    productImage: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.background, marginBottom: 8 },
    productName: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, minHeight: 32 },
    productPrice: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.primaryRed, marginTop: 4 },
    productCurrency: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textFaint },
    // Addresses
    addAddressBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primaryRed,
      borderRadius: 999,
      paddingVertical: 11,
      marginBottom: 16,
    },
    addAddressBtnText: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.onPrimary },
    addressCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 },
    addressCardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    addressCardInfo: { flex: 1 },
    addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    addressLabel: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    addressName: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft, marginTop: 4 },
    addressLine: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3, lineHeight: 16 },
    addressActions: { gap: 6, alignItems: 'flex-end' },
    addressActionBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    addressActionDanger: { borderColor: 'rgba(220,38,38,0.35)' },
    addressActionText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.textSoft },
    // Notifications
    notifRow: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
    notifBody: { flex: 1 },
    notifMessage: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textSoft },
    notifUnread: { fontFamily: fonts.bodyBold, color: colors.text },
    notifTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint, marginTop: 3 },
    // Sheets (address form + country picker)
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      maxHeight: '85%',
    },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 17, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    sheetLabel: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.textFaint, marginBottom: 6, marginTop: 10 },
    sheetInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
      justifyContent: 'center',
    },
    sheetError: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 12.5, marginTop: 12 },
    sheetBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    sheetCancelBtn: { paddingHorizontal: 18, justifyContent: 'center' },
    sheetCancelText: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    checkboxLabel: { fontSize: 13, fontFamily: fonts.body, color: colors.textSoft },
    countryRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    countryRowText: { fontSize: 14, fontFamily: fonts.body, color: colors.text },
  });
}
