import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { FONT, Text, colors, s } from './ui';

export const hm = (m: number) => (m <= 0 ? '0m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);

export function Ring({ fraction, children }: { fraction: number; children: React.ReactNode }) {
  const size = 200;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.wash} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.peacock} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * Math.max(fraction, 0.012)} ${c}`} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      {children}
    </View>
  );
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontFamily: FONT.display, fontSize: 19, color: colors.ink }}>{title}</Text>
        {action ? <Pressable onPress={onAction} hitSlop={10}><Text style={{ fontFamily: FONT.bold, fontSize: 13, color: colors.peacock }}>{action}</Text></Pressable> : null}
      </View>
      <View style={{ backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

export function Row({ label, value, note, last, tone }: { label: string; value: string; note?: string; last?: boolean; tone?: 'bad' }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.wash }}>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text>
      <Text style={{ fontFamily: FONT.display, fontSize: 18, color: tone === 'bad' ? colors.bad : colors.ink }}>{value}{note ? <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.muted }}> {note}</Text> : null}</Text>
    </View>
  );
}

export function Bar({ label, available, used, total, caption, last }: { label: string; available: string; used: number; total: number; caption: string; last?: boolean }) {
  const frac = total > 0 ? Math.min(used / total, 1) : 0;
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.wash }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={s.body}>{label}</Text>
        <Text style={{ fontFamily: FONT.display, fontSize: 20, color: colors.ink }}>{available}<Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.muted }}> available</Text></Text>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.wash, marginTop: 8, overflow: 'hidden' }}>
        <View style={{ width: `${frac * 100}%`, height: 5, backgroundColor: colors.peacock }} />
      </View>
      <Text style={[s.muted, { marginTop: 6, fontSize: 12 }]}>{caption}</Text>
    </View>
  );
}

export function Stat({ value, label, last }: { value: number; label: string; last?: boolean }) {
  return (
    <View style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRightWidth: last ? 0 : 1, borderRightColor: colors.wash }}>
      <Text style={{ fontFamily: FONT.display, fontSize: 26, color: colors.ink }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </View>
  );
}
