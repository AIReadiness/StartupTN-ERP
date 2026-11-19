import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text as RNText, TextProps, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** The same palette as the StartupTN web portal: blue-grey paper, navy ink, one blue brand colour. */
export const colors = {
  paper: '#f3f5f8', bg: '#f3f5f8', white: '#ffffff', ink: '#172033', muted: '#566275', line: '#d9dee6', wash: '#ecf0f5',
  peacock: '#1b4fb3', peacockDark: '#123a8a', peacockTint: '#dfe9fa', soft: '#ecf0f5',
  marigold: '#e39b12', marigoldTint: '#fbefd2', marigoldInk: '#6b4500',
  kumkum: '#b4372a', kumkumTint: '#fae5e1', bad: '#b4372a', warn: '#6b4500',
  indigo: '#6a4aa5', indigoTint: '#ece6f6',
};

export const FONT = {
  regular: 'PublicSans_400Regular',
  bold: 'PublicSans_600SemiBold',
  display: 'Fraunces_700Bold',
  displaySemi: 'Fraunces_600SemiBold',
};

/** Text in Public Sans (and Fraunces for headings). Custom fonts need a family per weight, so the weight picks the family. */
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const w = String(flat.fontWeight ?? '400');
  const bold = w === 'bold' || Number(w) >= 600;
  const family = flat.fontFamily ?? (bold ? FONT.bold : FONT.regular);
  return <RNText {...rest} style={[style, { fontFamily: family, fontWeight: undefined }]} />;
}

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  check: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6',
  coffee: 'M5 8h11v6a4 4 0 01-4 4H9a4 4 0 01-4-4zM16 9h2a2 2 0 010 4h-2M8 3v2M12 3v2',
  people: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16.5 11a2.5 2.5 0 100-5M17 14.2c2.3.5 4 2.5 4 5.8',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, color = colors.ink, size = 22 }: { name: IconName; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICONS[name]} />
    </Svg>
  );
}

export function Button({ title, onPress, busy, kind = 'primary', disabled }: { title: string; onPress: () => void; busy?: boolean; kind?: 'primary' | 'quiet' | 'danger'; disabled?: boolean }) {
  const bg = kind === 'primary' ? colors.peacock : kind === 'danger' ? colors.kumkum : colors.white;
  const fg = kind === 'quiet' ? colors.ink : colors.white;
  return (
    <Pressable onPress={onPress} disabled={busy || disabled}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: kind === 'quiet' ? colors.line : bg, opacity: busy || disabled ? 0.55 : pressed ? 0.88 : 1 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

/** A tinted note: marigold for "look at this", kumkum for errors, blue for good news. */
export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' | 'ok' }) {
  const t = tone === 'error' ? { bg: colors.kumkumTint, fg: colors.kumkum } : tone === 'ok' ? { bg: colors.peacockTint, fg: colors.peacockDark } : { bg: colors.marigoldTint, fg: colors.marigoldInk };
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, marginVertical: 6 }}>
      <Text style={{ color: t.fg, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function Sheet({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => {}}>
      <View style={s.scrim}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export const s = StyleSheet.create({
  btn: { minHeight: 46, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginVertical: 5 },
  btnText: { fontSize: 15.5, fontWeight: '600' },
  scrim: { flex: 1, backgroundColor: 'rgba(23,32,51,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' },
  sheetTitle: { fontFamily: FONT.display, fontSize: 20, color: colors.ink, marginBottom: 10 },
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { padding: 18 },
  h1: { fontFamily: FONT.display, fontSize: 25, color: colors.ink },
  h2: { fontFamily: FONT.display, fontSize: 19, color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 11, fontSize: 15.5, backgroundColor: colors.white, color: colors.ink, fontFamily: FONT.regular },
});
