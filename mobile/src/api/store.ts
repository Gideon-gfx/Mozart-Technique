import { apiFetch } from './client';
import type {
  StoreAddress,
  StoreCategory,
  StoreInboxEntry,
  StoreOrder,
  StoreProductBatchItem,
  StoreProductDetail,
  StoreProductReview,
  StoreProductSummary,
  StoreReview,
} from './types';

export function fetchCategories() {
  return apiFetch<{ success: true; categories: StoreCategory[] }>('/api/store/categories');
}

export interface ProductSearchParams {
  category?: string;
  q?: string;
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'new';
  page?: number;
}

export function fetchProducts(params: ProductSearchParams = {}) {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.q) query.set('q', params.q);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));
  const qs = query.toString();
  return apiFetch<{ success: true; products: StoreProductSummary[]; total: number; hasMore: boolean }>(
    `/api/store/products${qs ? `?${qs}` : ''}`,
  );
}

export function fetchProductBySlug(slug: string) {
  return apiFetch<{ success: true; product: StoreProductDetail; related: StoreProductSummary[] }>(
    `/api/store/products/${encodeURIComponent(slug)}`,
  );
}

export function fetchProductReviews(productId: number) {
  return apiFetch<{ success: true; reviews: StoreProductReview[]; avgRating: number | null; reviewCount: number }>(
    `/api/store/products/${productId}/reviews`,
  );
}

export function submitProductReview(productId: number, rating: number, text: string) {
  return apiFetch<{ success: true; review: StoreProductReview }>(`/api/store/products/${productId}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ rating, text }),
  });
}

export function updateProductReview(reviewId: number, rating: number, text: string) {
  return apiFetch<{ success: true; review: StoreProductReview }>(`/api/store/reviews/${reviewId}`, {
    method: 'PUT',
    body: JSON.stringify({ rating, text }),
  });
}

export function fetchProductsBatch(items: { productId: number; colorId: string | null }[]) {
  return apiFetch<{ success: true; items: StoreProductBatchItem[] }>('/api/store/products/batch', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function recordRecentlyViewed(productId: number) {
  return apiFetch<{ success: true }>('/api/store/recently-viewed', {
    method: 'POST',
    body: JSON.stringify({ productId }),
  });
}

export interface CheckoutItem {
  productId: number;
  colorId: string;
  quantity: number;
}

export function checkout(items: CheckoutItem[], addressId: number) {
  return apiFetch<{ success: true; url: string }>('/api/store/checkout', {
    method: 'POST',
    body: JSON.stringify({ items, addressId }),
  });
}

export function fetchOrders() {
  return apiFetch<{ success: true; orders: StoreOrder[] }>('/api/store/orders');
}

export function fetchInbox() {
  return apiFetch<{ success: true; inbox: StoreInboxEntry[] }>('/api/store/inbox');
}

export function fetchMyReviews() {
  return apiFetch<{ success: true; reviews: StoreReview[] }>('/api/store/my-reviews');
}

export function deleteReview(id: number) {
  return apiFetch<{ success: true }>(`/api/store/reviews/${id}`, { method: 'DELETE' });
}

export function fetchRecentlyViewed() {
  return apiFetch<{ success: true; products: StoreProductSummary[] }>('/api/store/recently-viewed');
}

export function fetchAddresses() {
  return apiFetch<{ success: true; addresses: StoreAddress[] }>('/api/store/addresses');
}

export interface AddressPayload {
  label: string;
  fullName: string;
  phone: string;
  country: string;
  countryName: string;
  state: string;
  city: string;
  street: string;
  postalCode: string;
  isDefault: boolean;
}

export function createAddress(payload: AddressPayload) {
  return apiFetch<{ success: true; address: StoreAddress }>('/api/store/addresses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAddress(id: number, payload: AddressPayload) {
  return apiFetch<{ success: true; address: StoreAddress }>(`/api/store/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteAddress(id: number) {
  return apiFetch<{ success: true }>(`/api/store/addresses/${id}`, { method: 'DELETE' });
}

export function setDefaultAddress(id: number) {
  return apiFetch<{ success: true; address: StoreAddress }>(`/api/store/addresses/${id}/default`, { method: 'POST' });
}
