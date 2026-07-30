// Lulu & Loop — mobile app (iOS + Android via Expo/EAS)
// Chat-first: Lulu AI guides the first order, account creation, reorders and
// support. "Mis piezas" shows every creation once signed in.
import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nswsahepscdbwnndpaqk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zd3NhaGVwc2NkYndubmRwYXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODUzODcsImV4cCI6MjEwMDM2MTM4N30.-_amGdcIC7ZgbkowkcnyJKR0Aol7JHrkCeqF1-odNoM';
const SITE = 'https://luluandloop.com';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

const C = {
  cream: '#FFF8F0', card: '#FFFEFC', pink: '#E4657E', pinkSoft: '#FBDDE6',
  deep: '#9A4B60', ink: '#2A2A33', muted: '#6E6E7A', border: '#F0E2D8',
};
const AVATAR = require('./assets/lulu-avatar.png');
const STAGE_LIST = ['New request', 'Quote review', 'In progress', 'Ready', 'Shipped'];
const STAGES_ES = { 'New request': 'Nueva solicitud', 'Quote review': 'Cotización', 'In progress': 'En proceso', Ready: 'Lista', Shipped: 'Enviada' };

function makeVisitorId() {
  return 'app-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

const HELLO = {
  role: 'lulu',
  text: '¡Hola! Soy Lulu 💗 Tejo piezas únicas a mano — muñecos, cobijas, regalos con historia. Cuéntame: ¿qué te gustaría que tejiera para ti? / Hi! I\'m Lulu — tell me what you\'d love me to crochet for you.',
};

export default function App() {
  const [tab, setTab] = useState('chat');            // chat | pieces | auth
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([HELLO]); // {role:'me'|'lulu', text, concept?, checkout?, orders?, accountCta?}
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [orders, setOrders] = useState(null);
  const [authMode, setAuthMode] = useState('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const listRef = useRef(null);
  const visitorRef = useRef(null);
  const seenRef = useRef({});
  const lastAtRef = useRef(null);

  function mapServerMsg(m) {
    const out = { role: m.role === 'user' ? 'me' : m.role === 'staff' ? 'staff' : 'lulu', text: m.body };
    if (m.staff_name) out.staffName = m.staff_name;
    for (const a of (m.meta && m.meta.actions) || []) {
      if (a.type === 'concept') out.concept = a.url;
      if (a.type === 'checkout') out.checkout = a;
      if (a.type === 'orders') out.orders = a.orders;
    }
    return out;
  }

  async function syncHistory(sinceOnly) {
    if (!visitorRef.current) return;
    try {
      const payload = { history: true, visitor_id: visitorRef.current };
      if (sinceOnly && lastAtRef.current) payload.since = lastAtRef.current;
      const r = await fetch(`${SUPABASE_URL}/functions/v1/lulu-agent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((x) => x.json());
      const fresh = (r && r.messages) || [];
      if (!fresh.length) return;
      setMessages((prev) => {
        let base = sinceOnly ? [...prev] : [];
        if (!sinceOnly) seenRef.current = {};
        for (const m of fresh) {
          if (seenRef.current[m.id]) continue;
          seenRef.current[m.id] = true;
          lastAtRef.current = m.created_at;
          base.push(mapServerMsg(m));
        }
        return base.length ? base : [HELLO];
      });
    } catch (e) { /* offline — keep local view */ }
  }

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    AsyncStorage.getItem('lulu.chat').then((raw) => {
      if (raw) { try { setMessages(JSON.parse(raw)); } catch (e) { /* keep default */ } }
    });
    AsyncStorage.getItem('lulu.visitor').then((v) => {
      if (!v) { v = makeVisitorId(); AsyncStorage.setItem('lulu.visitor', v).catch(() => {}); }
      visitorRef.current = v;
      syncHistory(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (tab !== 'chat') return;
    const iv = setInterval(() => { if (!thinking) syncHistory(true); }, 7000);
    return () => clearInterval(iv);
  }, [tab, thinking]);

  useEffect(() => {
    AsyncStorage.setItem('lulu.chat', JSON.stringify(messages.slice(-40))).catch(() => {});
    setTimeout(() => listRef.current && listRef.current.scrollToEnd({ animated: true }), 120);
  }, [messages]);

  useEffect(() => { if (tab === 'pieces' && session) loadOrders(); }, [tab, session]);

  async function loadOrders() {
    setOrders(null);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/order-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'list' }),
      }).then((x) => x.json());
      setOrders(r.orders ?? []);
    } catch (e) { setOrders([]); }
  }

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    const next = [...messages, { role: 'me', text }];
    setMessages(next);
    setThinking(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/lulu-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: visitorRef.current || (visitorRef.current = makeVisitorId()),
          message: text,
          source: 'app',
          jwt: session ? session.access_token : undefined,
        }),
      }).then((x) => x.json());
      const bubble = { role: 'lulu', text: r.reply || '…' };
      for (const a of r.actions || []) {
        if (a.type === 'concept') bubble.concept = a.url;
        if (a.type === 'checkout') bubble.checkout = a;
        if (a.type === 'orders') bubble.orders = a.orders;
      }
      setMessages((m) => [...m, bubble]);
      if (bubble.checkout && !session) {
        setMessages((m) => [...m, {
          role: 'lulu',
          text: 'Cuando termines el pago, crea tu cuenta con el MISMO correo para ver todas tus piezas aquí 💗',
          accountCta: true,
        }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'lulu', text: 'Se me enredó el estambre 🧶 ¿me lo repites?' }]);
    }
    setThinking(false);
  }

  async function doAuth() {
    setAuthErr(''); setAuthBusy(true);
    const email = authEmail.trim().toLowerCase();
    try {
      const { error } = authMode === 'signup'
        ? await sb.auth.signUp({ email, password: authPass })
        : await sb.auth.signInWithPassword({ email, password: authPass });
      if (error) setAuthErr(error.message);
      else setTab('pieces');
    } catch (e) { setAuthErr(String(e.message || e)); }
    setAuthBusy(false);
  }

  const renderBubble = ({ item }) => {
    if (item.role === 'me') {
      return <View style={[s.bubble, s.mine]}><Text style={s.myText}>{item.text}</Text></View>;
    }
    if (item.role === 'staff') {
      return (
        <View style={s.luluRow}>
          <Image source={AVATAR} style={s.avatar} />
          <View style={[s.bubble, s.hers]}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.deep, marginBottom: 2 }}>👩‍🎨 {item.staffName || 'Equipo del estudio'}</Text>
            <Text style={s.herText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={s.luluRow}>
        <Image source={AVATAR} style={s.avatar} />
        <View style={{ flex: 1 }}>
          <View style={[s.bubble, s.hers]}>
            <Text style={s.herText}>{item.text}</Text>
          </View>
          {item.concept ? (
            <View style={s.conceptCard}>
              <Image source={{ uri: item.concept }} style={s.conceptImg} />
              <Text style={s.conceptCap}>Boceto IA — Lulu teje la de verdad 💗</Text>
            </View>
          ) : null}
          {item.checkout ? (
            <Pressable style={s.payBtn} onPress={() => WebBrowser.openBrowserAsync(item.checkout.url)}>
              <Text style={s.payBtnTx}>💳 Pagar depósito · {item.checkout.code}</Text>
            </Pressable>
          ) : null}
          {item.accountCta ? (
            <Pressable style={s.ctaBtn} onPress={() => setTab('auth')}>
              <Text style={s.ctaBtnTx}>✨ Crear mi cuenta</Text>
            </Pressable>
          ) : null}
          {item.orders ? item.orders.map((o) => (
            <View key={o.code} style={s.orderCard}>
              <Text style={s.orderItem}>{o.item}</Text>
              <Text style={s.orderMeta}>{o.code} · {STAGES_ES[o.stage] || o.stage}{o.tracking ? ' · 📦' : ''}</Text>
            </View>
          )) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.cream} />
      <View style={s.header}>
        <Image source={AVATAR} style={s.headerAvatar} />
        <View>
          <Text style={s.wordmark}>Lulu <Text style={{ color: C.pink }}>&</Text> Loop</Text>
          <Text style={s.headerSub}>{thinking ? 'Lulu está tejiendo una respuesta…' : 'Lulu · siempre en línea 🧶'}</Text>
        </View>
      </View>

      {tab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderBubble}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
          />
          {thinking ? (
            <View style={s.typing}><ActivityIndicator color={C.pink} size="small" />
              <Text style={s.typingTx}> Lulu está escribiendo…</Text></View>
          ) : null}
          <View style={s.composer}>
            <TextInput
              style={s.inputBox}
              value={input}
              onChangeText={setInput}
              placeholder="Cuéntale tu idea a Lulu…"
              placeholderTextColor={C.muted}
              multiline
            />
            <Pressable style={[s.sendBtn, !input.trim() && { opacity: 0.5 }]} onPress={send}>
              <Text style={s.sendTx}>➤</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {tab === 'pieces' && (
        <View style={{ flex: 1, padding: 14 }}>
          <Text style={s.title}>Mis piezas</Text>
          {!session ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyTx}>Inicia sesión para ver todas tus creaciones 💗</Text>
              <Pressable style={s.ctaBtn} onPress={() => setTab('auth')}><Text style={s.ctaBtnTx}>Entrar / Crear cuenta</Text></Pressable>
            </View>
          ) : orders === null ? (
            <ActivityIndicator color={C.pink} style={{ marginTop: 40 }} />
          ) : !orders.length ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyTx}>Aún no hay piezas con este correo. ¡Pídele la primera a Lulu! 🧶</Text>
              <Pressable style={s.ctaBtn} onPress={() => setTab('chat')}><Text style={s.ctaBtnTx}>Crear mi primera pieza</Text></Pressable>
            </View>
          ) : (
            <FlatList
              data={orders}
              keyExtractor={(o) => o.code}
              renderItem={({ item: o }) => (
                <View style={s.pieceCard}>
                  {o.img ? <Image source={{ uri: o.img.startsWith('http') ? o.img : SITE + o.img }} style={s.pieceImg} /> : null}
                  <View style={{ flex: 1, padding: 12 }}>
                    <Text style={s.orderItem}>{o.item}</Text>
                    <Text style={s.orderMeta}>{o.code} · ${o.price}</Text>
                    <View style={s.stageChip}><Text style={s.stageTx}>{STAGES_ES[STAGE_LIST[o.stage]] || o.stage}</Text></View>
                  </View>
                </View>
              )}
            />
          )}
          {session ? (
            <Pressable onPress={() => sb.auth.signOut()} style={{ padding: 10 }}>
              <Text style={{ color: C.muted, textAlign: 'center', fontSize: 12 }}>Cerrar sesión ({session.user.email})</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {tab === 'auth' && (
        <View style={{ flex: 1, padding: 20 }}>
          <Text style={s.title}>{authMode === 'signup' ? 'Crear mi cuenta' : 'Entrar'}</Text>
          <Text style={{ color: C.muted, marginBottom: 14 }}>
            Usa el mismo correo de tu compra y todas tus piezas aparecerán solitas 💗
          </Text>
          <TextInput style={s.field} placeholder="Correo" placeholderTextColor={C.muted}
            autoCapitalize="none" keyboardType="email-address" value={authEmail} onChangeText={setAuthEmail} />
          <TextInput style={s.field} placeholder="Contraseña (mín. 8)" placeholderTextColor={C.muted}
            secureTextEntry value={authPass} onChangeText={setAuthPass} />
          {authErr ? <Text style={{ color: C.deep, marginBottom: 8 }}>{authErr}</Text> : null}
          <Pressable style={s.payBtn} onPress={doAuth} disabled={authBusy}>
            <Text style={s.payBtnTx}>{authBusy ? '…' : authMode === 'signup' ? 'Crear cuenta' : 'Entrar'}</Text>
          </Pressable>
          <Pressable onPress={() => setAuthMode(authMode === 'signup' ? 'signin' : 'signup')} style={{ padding: 12 }}>
            <Text style={{ color: C.pink, textAlign: 'center', fontWeight: '700' }}>
              {authMode === 'signup' ? 'Ya tengo cuenta — entrar' : 'Soy nueva — crear cuenta'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={s.tabbar}>
        {[['chat', '💬', 'Lulu'], ['pieces', '🧶', 'Mis piezas'], ['auth', session ? '👤' : '✨', session ? 'Cuenta' : 'Entrar']].map(([k, ic, lb]) => (
          <Pressable key={k} style={s.tabBtn} onPress={() => setTab(k)}>
            <Text style={{ fontSize: 20 }}>{ic}</Text>
            <Text style={[s.tabTx, tab === k && { color: C.pink }]}>{lb}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.cream },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.cream },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.pink },
  wordmark: { fontSize: 18, fontWeight: '900', color: C.ink },
  headerSub: { fontSize: 11.5, color: C.muted, fontWeight: '600' },
  luluRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15, marginBottom: 2 },
  bubble: { borderRadius: 16, padding: 12, maxWidth: '86%' },
  mine: { backgroundColor: C.pink, alignSelf: 'flex-end', marginBottom: 12, borderBottomRightRadius: 4 },
  hers: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  myText: { color: '#FFF4F2', fontSize: 15, lineHeight: 21 },
  herText: { color: C.ink, fontSize: 15, lineHeight: 21 },
  conceptCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 8, marginTop: 8, maxWidth: '86%' },
  conceptImg: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  conceptCap: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6, fontWeight: '600' },
  payBtn: { backgroundColor: C.ink, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 20, marginTop: 8, alignSelf: 'flex-start' },
  payBtnTx: { color: C.cream, fontWeight: '800', fontSize: 14 },
  ctaBtn: { backgroundColor: C.pinkSoft, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, marginTop: 8, alignSelf: 'flex-start' },
  ctaBtnTx: { color: C.deep, fontWeight: '800', fontSize: 14 },
  orderCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, marginTop: 6, maxWidth: '86%' },
  orderItem: { fontWeight: '800', color: C.ink, fontSize: 14 },
  orderMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  typing: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 6 },
  typingTx: { color: C.muted, fontSize: 12, fontStyle: 'italic' },
  composer: { flexDirection: 'row', padding: 10, gap: 8, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.cream, alignItems: 'flex-end' },
  inputBox: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.ink, maxHeight: 110 },
  sendBtn: { backgroundColor: C.pink, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendTx: { color: '#fff', fontSize: 17, fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '900', color: C.ink, marginBottom: 10 },
  emptyBox: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 20, alignItems: 'center', gap: 6 },
  emptyTx: { color: C.muted, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  pieceCard: { flexDirection: 'row', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  pieceImg: { width: 86, height: 86 },
  stageChip: { backgroundColor: C.pinkSoft, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  stageTx: { color: C.deep, fontSize: 11, fontWeight: '800' },
  field: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 13, fontSize: 16, color: C.ink, marginBottom: 10 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.border, backgroundColor: C.card },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabTx: { fontSize: 11, fontWeight: '800', color: C.muted, marginTop: 1 },
});
