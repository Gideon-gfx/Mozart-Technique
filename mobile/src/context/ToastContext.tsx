import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';

import ToastStack, { type ToastItem, type ToastVariant } from '../components/Toast';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';
import GlassSurface from '../components/GlassSurface';
import { useMotion } from './MotionContext';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface ActionSheetOptions {
  title?: string;
  message?: string;
  actions: ActionSheetOption[];
  cancelLabel?: string;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  actionSheet: (opts: ActionSheetOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3400;

// The real-message replacement for every use of Alert.alert in the app:
// `toast` for single-button informational popups, `confirm` for Cancel/OK
// choices, `actionSheet` for a list of options (e.g. "Delete for
// me"/"Delete for everyone") - all styled like the rest of the app instead
// of the OS's native black-text-on-white-background dialog.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [sheetState, setSheetState] = useState<ActionSheetOptions | null>(null);

  const dismissToast = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, message, variant }]);
    setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  }, [dismissToast]);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const actionSheet = useCallback((opts: ActionSheetOptions) => {
    setSheetState(opts);
  }, []);

  const value = useMemo(() => ({ toast, confirm, actionSheet }), [toast, confirm, actionSheet]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack items={items} onDismiss={dismissToast} colors={colors} />
      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => { confirmState?.resolve(false); setConfirmState(null); }}>
        <Pressable style={styles.backdrop} onPress={() => { confirmState?.resolve(false); setConfirmState(null); }}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            {confirmState?.title ? <Text style={[styles.confirmTitle, { color: colors.text }]}>{confirmState.title}</Text> : null}
            <Text style={[styles.confirmMessage, { color: colors.textSoft }]}>{confirmState?.message}</Text>
            <View style={styles.confirmRow}>
              <Pressable
                style={[styles.confirmBtn, { borderColor: colors.border }]}
                onPress={() => { confirmState?.resolve(false); setConfirmState(null); }}
              >
                <Text style={[styles.confirmBtnText, { color: colors.text }]}>{confirmState?.cancelLabel || 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnPrimary, { backgroundColor: confirmState?.destructive ? colors.danger : colors.primaryRed }]}
                onPress={() => { confirmState?.resolve(true); setConfirmState(null); }}
              >
                <Text style={[styles.confirmBtnText, styles.confirmBtnTextPrimary]}>{confirmState?.confirmLabel || 'Confirm'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={!!sheetState} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setSheetState(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetState(null)}>
          <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            {sheetState?.title ? <Text style={[styles.confirmTitle, styles.sheetTitle, { color: colors.text }]}>{sheetState.title}</Text> : null}
            {sheetState?.message ? <Text style={[styles.confirmMessage, styles.sheetMessage, { color: colors.textSoft }]}>{sheetState.message}</Text> : null}
            {sheetState?.actions.map((action, index) => (
              <Pressable
                key={index}
                style={[styles.sheetRow, { borderTopColor: colors.border }]}
                onPress={() => { setSheetState(null); action.onPress(); }}
              >
                <Text style={[styles.sheetRowText, { color: action.destructive ? colors.danger : colors.text }]}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.sheetRow, styles.sheetCancelRow, { borderTopColor: colors.border }]} onPress={() => setSheetState(null)}>
              <Text style={[styles.sheetRowText, { color: colors.textFaint, fontFamily: fonts.bodyBold }]}>{sheetState?.cancelLabel || 'Cancel'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  confirmCard: {
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 18,
    padding: 20,
  },
  confirmTitle: { fontSize: 16, fontFamily: fonts.displayBlack, marginBottom: 6 },
  confirmMessage: { fontSize: 13.5, fontFamily: fonts.body, lineHeight: 19 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 11, alignItems: 'center' },
  confirmBtnPrimary: { borderWidth: 0 },
  confirmBtnText: { fontSize: 13.5, fontFamily: fonts.bodyBold },
  confirmBtnTextPrimary: { color: '#fff' },
  sheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingBottom: 34,
    paddingTop: 10,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { textAlign: 'center', marginBottom: 2 },
  sheetMessage: { textAlign: 'center', marginBottom: 6 },
  sheetRow: { paddingVertical: 15, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  sheetCancelRow: { marginTop: 4 },
  sheetRowText: { fontSize: 14.5, fontFamily: fonts.bodySemiBold },
});
