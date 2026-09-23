import { ScrollView } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import * as adminApi from '../../api/admin';
import type { AdminProductColor, AdminStoreProduct } from '../../api/admin';
import { ApiError, resolveMediaUrl } from '../../api/client';
import { fetchGeo } from '../../api/geo';
import BackButton from '../../components/BackButton';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../context/ToastContext';
import type { AdminMoreStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<AdminMoreStackParamList, 'AdminStoreProducts'>;

// Matches admin.html's own #product-category options exactly.
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'scripts-scores', label: 'Sheet Music & Scores' },
  { value: 'instruments', label: 'Instruments' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'digital-products', label: 'Digital Products' },
  { value: 'books-learning', label: 'Books & Learning' },
];

let uidSeq = 0;
function nextUid() {
  uidSeq += 1;
  return `c${Date.now()}${uidSeq}`;
}

interface StockRowForm {
  key: string;
  countryCode: string;
  quantity: string;
}

interface ColorForm {
  key: string;
  // The server's real color id (data/products.js's normalizeColors mints a
  // fresh one whenever a color arrives without it - on every create AND
  // every update). Round-tripping it on edit, like admin.html's own
  // dataset.colorId does, keeps an existing color's id stable across edits;
  // dropping it here would silently mint new ids for colors the admin
  // never touched, orphaning any cart item already referencing the old one
  // (server.js resolves cart line items by colorId).
  id?: string;
  name: string;
  hex: string;
  stock: StockRowForm[];
}

// Full parity with admin.html's own product form: name, category, price,
// status, description, cover image, additional gallery images, and colors
// with per-country stock - that last one isn't optional on the server side
// (POST/PUT /api/admin/products 400s without at least one color that has
// stock somewhere), so it has to exist here for product creation to work
// at all, not just for feature completeness.
export default function AdminStoreProductsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const [products, setProducts] = useState<AdminStoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<AdminStoreProduct | null>(null);

  const load = useCallback(() => {
    return adminApi
      .fetchAdminProducts()
      .then((res) => {
        setProducts(res.products);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load products.'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function toggleStatus(p: AdminStoreProduct) {
    setBusyId(p.id);
    try {
      await adminApi.setProductStatus(p.id, p.status === 'active' ? 'archived' : 'active');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update that product.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Store Products</Text>
        <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)} hitSlop={8}>
          <Ionicons name="add" size={22} color={colors.primaryRed} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primaryRed} style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : products.length === 0 ? (
        <Text style={styles.emptyText}>No products yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {products.map((p, i) => {
            const cover = resolveMediaUrl(p.coverImage);
            return (
              <Pressable key={p.id} style={[styles.row, i > 0 && { marginTop: 10 }]} onPress={() => setEditProduct(p)}>
                {cover ? <Image source={{ uri: cover }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbPlaceholder]} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.rowMeta}>{p.category} · ${p.priceUsd.toFixed(2)}</Text>
                </View>
                <Pressable style={[styles.badge, p.status === 'active' ? styles.badgeActive : styles.badgeNeutral]} onPress={() => toggleStatus(p)} disabled={busyId === p.id}>
                  {busyId === p.id ? <ActivityIndicator size="small" color={colors.text} /> : (
                    <Text style={[styles.badgeText, p.status === 'active' ? styles.badgeTextActive : styles.badgeTextNeutral]}>{p.status}</Text>
                  )}
                </Pressable>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ProductFormSheet
        visible={addOpen}
        product={null}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          load();
        }}
        colors={colors}
      />
      <ProductFormSheet
        visible={!!editProduct}
        product={editProduct}
        onClose={() => setEditProduct(null)}
        onSaved={() => {
          setEditProduct(null);
          load();
        }}
        colors={colors}
      />
    </View>
  );
}

function colorFromProduct(c: AdminProductColor): ColorForm {
  return {
    key: nextUid(),
    id: c.id,
    name: c.name,
    hex: c.hex,
    stock: (c.stock || []).map((s) => ({ key: nextUid(), countryCode: s.countryCode, quantity: String(s.quantity) })),
  };
}

function ProductFormSheet({
  visible,
  product,
  onClose,
  onSaved,
  colors,
}: {
  visible: boolean;
  product: AdminStoreProduct | null;
  onClose: () => void;
  onSaved: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { toast } = useToast();
  const isEdit = !!product;
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'draft'>('active');
  const [cover, setCover] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [colorForms, setColorForms] = useState<ColorForm[]>([]);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [defaultCountry, setDefaultCountry] = useState('US');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [countryPickerFor, setCountryPickerFor] = useState<{ colorKey: string; stockKey: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    fetchGeo()
      .then((res) => {
        setCountries(res.countries);
        setDefaultCountry(res.countryCode);
      })
      .catch(() => {});
    if (product) {
      setName(product.name);
      setCategory(product.category);
      setPrice(String(product.priceUsd || ''));
      setDescription(product.description || '');
      setStatus(product.status === 'archived' ? 'active' : product.status);
      setCover(product.coverImage || null);
      setImages(product.images ? [...product.images] : []);
      setColorForms((product.colors || []).map(colorFromProduct));
    } else {
      setName('');
      setCategory(CATEGORIES[0].value);
      setPrice('');
      setDescription('');
      setStatus('active');
      setCover(null);
      setImages([]);
      setColorForms([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, product?.id]);

  function addColor() {
    setColorForms((prev) => [
      ...prev,
      { key: nextUid(), name: '', hex: '#cc0000', stock: [{ key: nextUid(), countryCode: defaultCountry, quantity: '0' }] },
    ]);
  }

  function removeColor(key: string) {
    setColorForms((prev) => prev.filter((c) => c.key !== key));
  }

  function updateColor(key: string, patch: Partial<ColorForm>) {
    setColorForms((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function addStockRow(colorKey: string) {
    setColorForms((prev) => prev.map((c) => (c.key === colorKey ? { ...c, stock: [...c.stock, { key: nextUid(), countryCode: defaultCountry, quantity: '0' }] } : c)));
  }

  function removeStockRow(colorKey: string, stockKey: string) {
    setColorForms((prev) => prev.map((c) => (c.key === colorKey ? { ...c, stock: c.stock.filter((s) => s.key !== stockKey) } : c)));
  }

  function updateStockRow(colorKey: string, stockKey: string, patch: Partial<StockRowForm>) {
    setColorForms((prev) => prev.map((c) => (c.key === colorKey ? { ...c, stock: c.stock.map((s) => (s.key === stockKey ? { ...s, ...patch } : s)) } : c)));
  }

  async function pickCover() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access to choose a cover image.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingCover(true);
    try {
      const uploaded = await adminApi.uploadAdminProductImage({ uri: asset.uri, name: asset.fileName || 'cover.jpg', type: asset.mimeType || 'image/jpeg' });
      setCover(uploaded.url);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed.', 'error');
    } finally {
      setUploadingCover(false);
    }
  }

  async function addImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Permission needed: allow photo library access to add images.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const uploaded = await adminApi.uploadAdminProductImage({ uri: asset.uri, name: asset.fileName || 'image.jpg', type: asset.mimeType || 'image/jpeg' });
      setImages((prev) => [...prev, uploaded.url]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed.', 'error');
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function submit() {
    if (!name.trim()) return toast('Enter a product name.', 'error');
    if (!cover) return toast('Upload a cover image.', 'error');
    if (!colorForms.length) return toast('Add at least one color.', 'error');
    for (const c of colorForms) {
      if (!c.name.trim()) return toast('Every color needs a name.', 'error');
      if (!c.stock.some((s) => Number(s.quantity) > 0)) return toast(`Add at least one country with stock for "${c.name}".`, 'error');
    }

    const payload = {
      name: name.trim(),
      category,
      coverImage: cover,
      priceUsd: Number(price) || 0,
      description: description.trim() || undefined,
      status,
      images,
      colors: colorForms.map((c) => ({
        id: c.id,
        name: c.name.trim(),
        hex: c.hex,
        stock: c.stock.map((s) => ({ countryCode: s.countryCode, quantity: Number(s.quantity) || 0 })),
      })),
    };

    setSaving(true);
    try {
      if (isEdit && product) {
        await adminApi.updateAdminProduct(product.id, payload);
        toast('Product updated.', 'success');
      } else {
        await adminApi.createAdminProduct(payload);
        toast('Product added.', 'success');
      }
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save that product.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const countryName = (code: string) => countries.find((c) => c.code === code)?.name || code;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{isEdit ? `Edit "${product?.name}"` : 'Add a product'}</Text>

            <Text style={styles.fieldLabel}>Cover image</Text>
            <Pressable style={styles.coverPicker} onPress={pickCover} disabled={uploadingCover}>
              {uploadingCover ? (
                <View style={styles.coverPlaceholder}><ActivityIndicator color={colors.primaryRed} /></View>
              ) : cover ? (
                <Image source={{ uri: resolveMediaUrl(cover)! }} style={styles.coverPreview} />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={22} color={colors.textFaint} />
                  <Text style={styles.coverPlaceholderText}>Choose image</Text>
                </View>
              )}
            </Pressable>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Product name" placeholderTextColor={colors.textFaint} />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipsRow}>
              {CATEGORIES.map((c) => (
                <Pressable key={c.value} style={[styles.chip, category === c.value && styles.chipActive]} onPress={() => setCategory(c.value)}>
                  <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Price (USD)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" />

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.chipsRow}>
              <Pressable style={[styles.chip, status === 'active' && styles.chipActive]} onPress={() => setStatus('active')}>
                <Text style={[styles.chipText, status === 'active' && styles.chipTextActive]}>Active (visible in store)</Text>
              </Pressable>
              <Pressable style={[styles.chip, status === 'draft' && styles.chipActive]} onPress={() => setStatus('draft')}>
                <Text style={[styles.chipText, status === 'draft' && styles.chipTextActive]}>Draft (hidden)</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Product description"
              placeholderTextColor={colors.textFaint}
              multiline
            />

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.fieldLabel}>Additional images</Text>
              <Pressable onPress={addImage} disabled={uploadingImage} hitSlop={8}>
                {uploadingImage ? <ActivityIndicator size="small" color={colors.primaryRed} /> : <Text style={styles.addLink}>+ Add image</Text>}
              </Pressable>
            </View>
            {images.length ? (
              <View style={styles.imagesRow}>
                {images.map((url) => (
                  <View key={url} style={styles.imageThumbWrap}>
                    <Image source={{ uri: resolveMediaUrl(url)! }} style={styles.imageThumb} />
                    <Pressable style={styles.imageRemoveBtn} onPress={() => removeImage(url)}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.fieldLabel}>Colors & stock by country</Text>
              <Pressable onPress={addColor} hitSlop={8}>
                <Text style={styles.addLink}>+ Add color</Text>
              </Pressable>
            </View>
            {colorForms.length === 0 ? <Text style={styles.emptyHint}>Add at least one color with stock in at least one country.</Text> : null}
            {colorForms.map((c) => (
              <View key={c.key} style={styles.colorBlock}>
                <View style={styles.colorTopRow}>
                  <View style={[styles.hexSwatch, { backgroundColor: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#cc0000' }]} />
                  <TextInput
                    style={[styles.input, styles.hexInput]}
                    value={c.hex}
                    onChangeText={(v) => updateColor(c.key, { hex: v })}
                    placeholder="#cc0000"
                    placeholderTextColor={colors.textFaint}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={c.name}
                    onChangeText={(v) => updateColor(c.key, { name: v })}
                    placeholder="Color name (e.g. Sunburst)"
                    placeholderTextColor={colors.textFaint}
                  />
                  <Pressable onPress={() => removeColor(c.key)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={17} color={colors.danger} />
                  </Pressable>
                </View>
                {c.stock.map((s) => (
                  <View key={s.key} style={styles.stockRow}>
                    <Pressable style={[styles.input, styles.countrySelect]} onPress={() => setCountryPickerFor({ colorKey: c.key, stockKey: s.key })}>
                      <Text style={styles.countrySelectText} numberOfLines={1}>{countryName(s.countryCode)}</Text>
                      <Ionicons name="chevron-down" size={14} color={colors.textFaint} />
                    </Pressable>
                    <TextInput
                      style={[styles.input, styles.stockQtyInput]}
                      value={s.quantity}
                      onChangeText={(v) => updateStockRow(c.key, s.key, { quantity: v.replace(/[^0-9]/g, '') })}
                      keyboardType="number-pad"
                      placeholder="Qty"
                      placeholderTextColor={colors.textFaint}
                    />
                    <Pressable onPress={() => removeStockRow(c.key, s.key)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={18} color={colors.textFaint} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => addStockRow(c.key)} hitSlop={6}>
                  <Text style={styles.addLink}>+ Add location</Text>
                </Pressable>
              </View>
            ))}

            <PrimaryButton title={isEdit ? 'Save changes' : 'Add product'} onPress={submit} loading={saving} style={{ marginTop: 18, marginBottom: 8 }} />
          </ScrollView>
        </Pressable>
      </Pressable>

      <CountryPickerModal
        visible={!!countryPickerFor}
        countries={countries}
        onClose={() => setCountryPickerFor(null)}
        onSelect={(code) => {
          if (countryPickerFor) updateStockRow(countryPickerFor.colorKey, countryPickerFor.stockKey, { countryCode: code });
          setCountryPickerFor(null);
        }}
        colors={colors}
      />
    </Modal>
  );
}

function CountryPickerModal({
  visible,
  countries,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  countries: { code: string; name: string }[];
  onClose: () => void;
  onSelect: (code: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const visibleCountries = countries.filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { maxHeight: '75%' }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Choose a country</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search countries"
            placeholderTextColor={colors.textFaint}
          />
          <ScrollView style={{ marginTop: 10 }}>
            {visibleCountries.map((c) => (
              <Pressable key={c.code} style={styles.countryOptionRow} onPress={() => onSelect(c.code)}>
                <Text style={styles.countryOptionText}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, gap: 10 },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    addBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center', marginTop: 20 },
    emptyText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', marginTop: 20 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
    thumb: { width: 46, height: 46, borderRadius: 10 },
    thumbPlaceholder: { backgroundColor: colors.background },
    rowTitle: { fontSize: 13.5, fontFamily: fonts.bodyBold, color: colors.text },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minWidth: 64, alignItems: 'center' },
    badgeActive: { backgroundColor: colors.statusActiveBg },
    badgeNeutral: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    badgeText: { fontSize: 10.5, fontFamily: fonts.bodyBold, textTransform: 'capitalize' },
    badgeTextActive: { color: colors.statusActiveText },
    badgeTextNeutral: { color: colors.textFaint },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, maxHeight: '88%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 16, fontFamily: fonts.displayBlack, color: colors.text, marginBottom: 14, textAlign: 'center' },
    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textFaint, marginTop: 10, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    textarea: { minHeight: 70, textAlignVertical: 'top' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.background },
    chipActive: { backgroundColor: colors.primaryRed, borderColor: colors.primaryRed },
    chipText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.text },
    chipTextActive: { color: colors.onPrimary },
    coverPicker: { alignSelf: 'flex-start' },
    coverPreview: { width: 84, height: 84, borderRadius: 14 },
    coverPlaceholder: {
      width: 84,
      height: 84,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      gap: 4,
    },
    coverPlaceholderText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textFaint },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    addLink: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primaryRed },
    emptyHint: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 4, marginBottom: 4 },
    imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    imageThumbWrap: { position: 'relative' },
    imageThumb: { width: 56, height: 56, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    imageRemoveBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorBlock: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginTop: 8, backgroundColor: colors.background, gap: 8 },
    colorTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hexSwatch: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    hexInput: { width: 90 },
    stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    countrySelect: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    countrySelectText: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text },
    stockQtyInput: { width: 70, textAlign: 'center' },
    countryOptionRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    countryOptionText: { fontSize: 14, fontFamily: fonts.body, color: colors.text },
  });
}
