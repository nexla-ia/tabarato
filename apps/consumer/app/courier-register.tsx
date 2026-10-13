import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { api } from '../src/api/client'
import { uploadDocumentFile, uploadDocumentImage } from '../src/api/upload'
import { useToast } from '../src/components/Toast'

const BLUE       = '#FF5500'
const BLUE_DARK  = '#CC5200'
const BLUE_LIGHT = '#FFF3EB'
const AMBER      = '#D97706'
const AMBER_BG   = '#FFFBEB'
const AMBER_LINE = '#FCD34D'
const GREEN      = '#22C55E'
const BG         = '#FFFBF7'
const CARD       = '#FFFFFF'
const BORDER     = '#F0E8E0'
const TEXT       = '#1A0A00'
const MUTED      = '#7A5C4A'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCPF(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function maskCPF(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length < 11) return cpf
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Valida CPF pelos dígitos verificadores — mesma regra do backend, pra não deixar
 *  o entregador preencher tudo e só levar 400 no envio. */
function isValidCPF(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const digit = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += parseInt(d[i], 10) * (len + 1 - i)
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  return digit(9) === parseInt(d[9], 10) && digit(10) === parseInt(d[10], 10)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DocKey    = 'cnhPhoto' | 'identityPhoto' | 'vehicleDoc'
type DocState  = { uri: string | null; url: string | null; uploading: boolean; isPdf?: boolean }

const DOCS: { key: DocKey; label: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'cnhPhoto',      label: 'Habilitação (CNH)',        sub: 'Frente com EAR visível',                  icon: 'card-outline' },
  { key: 'identityPhoto', label: 'Documento de identidade',  sub: 'RG ou outro documento com foto',          icon: 'person-circle-outline' },
  { key: 'vehicleDoc',    label: 'Doc. do veículo (CRLV)',   sub: 'Certificado de Registro e Licenciamento', icon: 'document-text-outline' },
]

const STEP_TITLES = ['Seus dados', 'Documentos', 'Revisão']

// Tipos de chave PIX (o Asaas precisa do tipo pra transferir o repasse).
const PIX_KEY_TYPES: { v: string; label: string }[] = [
  { v: 'CPF', label: 'CPF' },
  { v: 'CNPJ', label: 'CNPJ' },
  { v: 'EMAIL', label: 'E-mail' },
  { v: 'PHONE', label: 'Telefone' },
  { v: 'EVP', label: 'Aleatória' },
]

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CourierRegisterScreen() {
  const { show: toast } = useToast()
  const insets   = useSafeAreaInsets()
  const fadeAnim = useRef(new Animated.Value(1)).current
  const [step, setStep] = useState(0)

  const [cpf,   setCpf]   = useState('')
  const [cnh,   setCnh]   = useState('')
  const [plate, setPlate] = useState('')
  const [pixKey, setPixKey] = useState('')
  const [pixKeyType, setPixKeyType] = useState('CPF')
  const [docs,  setDocs]  = useState<Record<DocKey, DocState>>({
    cnhPhoto:      { uri: null, url: null, uploading: false },
    identityPhoto: { uri: null, url: null, uploading: false },
    vehicleDoc:    { uri: null, url: null, uploading: false },
  })
  const [submitting, setSubmitting] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  function goToStep(next: number) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      setStep(next)
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    })
  }

  function handleBack() {
    if (step === 0) { router.back(); return }
    goToStep(step - 1)
  }

  function handleNext() {
    if (step === 0) {
      if (cpf.replace(/\D/g, '').length < 11) {
        toast('Digite os 11 dígitos do CPF.', 'error')
        return
      }
      if (!isValidCPF(cpf)) {
        toast('Confira os números do CPF.', 'error')
        return
      }
      if (cnh.trim().length < 9) {
        toast('Digite o número completo da CNH.', 'error')
        return
      }
      if (plate.trim().length < 7) {
        toast('Digite a placa completa do veículo.', 'error')
        return
      }
      goToStep(1)
    } else if (step === 1) {
      const missing = DOCS.filter(d => !docs[d.key].url)
      if (missing.length > 0) {
        toast(`Envie: ${missing.map(d => d.label).join(', ')}.`, 'info')
        return
      }
      goToStep(2)
    }
  }

  function pickDocument(key: DocKey) {
    Alert.alert(
      'Enviar documento',
      'Escolha o formato do arquivo',
      [
        { text: 'Foto da galeria', onPress: () => pickFromGallery(key) },
        { text: 'Arquivo PDF',     onPress: () => pickFromFiles(key) },
        { text: 'Cancelar', style: 'cancel' },
      ],
    )
  }

  async function pickFromGallery(key: DocKey) {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        toast('Permita o acesso à galeria nas configurações.', 'error')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      })
      if (result.canceled) return
      const asset = result.assets?.[0]
      if (!asset?.uri) { toast('Não consegui ler a imagem. Tente outra.', 'error'); return }
      await uploadFile(key, asset.uri, 'image/jpeg', 'doc.jpg')
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível abrir a galeria.', 'error')
    }
  }

  async function pickFromFiles(key: DocKey) {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets?.[0]
      if (!asset?.uri) { toast('Não consegui ler o arquivo. Tente outro.', 'error'); return }
      await uploadFile(key, asset.uri, 'application/pdf', asset.name ?? 'doc.pdf')
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível abrir os arquivos.', 'error')
    }
  }

  async function uploadFile(key: DocKey, uri: string, type: string, name: string) {
    const isPdf = !type.startsWith('image/')
    setDocs(p => ({ ...p, [key]: { uri, url: null, uploading: true, isPdf } }))
    try {
      // Documentos vão para o bucket PRIVADO (PII). `url` guarda o PATH retornado
      // (não uma URL pública). Imagem: redimensiona/converte pra JPEG antes de
      // enviar (foto de câmera em resolução cheia estoura a memória em aparelho
      // real → app fecha). PDF vai como está.
      const url = isPdf
        ? await uploadDocumentFile(uri, { type, name })
        : await uploadDocumentImage(uri, { name })
      setDocs(p => ({ ...p, [key]: { uri, url, uploading: false, isPdf } }))
    } catch (e: any) {
      setDocs(p => ({ ...p, [key]: { uri: null, url: null, uploading: false } }))
      toast(e?.message ?? 'Não foi possível enviar o arquivo. Tente novamente.', 'error')
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await api.post('/couriers', {
        cpf:                cpf.replace(/\D/g, ''),
        cnh:                cnh.trim(),
        vehiclePlate:       plate.trim(),
        vehicleType:        'moto',
        pixKey:             pixKey.trim() || undefined,
        pixKeyType:         pixKey.trim() ? pixKeyType : undefined,
        cnhPhotoUrl:        docs.cnhPhoto.url,
        identityPhotoUrl:   docs.identityPhoto.url,
        vehicleDocPhotoUrl: docs.vehicleDoc.url,
        acceptedTerms,
      })
      router.replace('/(courier-tabs)')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível enviar. Tente novamente.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const step1Valid = isValidCPF(cpf) && cnh.trim().length >= 9 && plate.trim().length >= 7
  const step2Valid = DOCS.every(d => docs[d.key].url !== null)
  const canNext    = step === 0 ? step1Valid : step === 1 ? step2Valid : true

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cadastro de Entregador</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Progress */}
      <View style={s.progressWrap}>
        {STEP_TITLES.map((label, i) => (
          <View key={i} style={s.progressItem}>
            {i > 0 && <View style={[s.progressLine, i <= step && s.progressLineDone]} />}
            <View style={[s.dot, i < step && s.dotDone, i === step && s.dotActive]}>
              {i < step
                ? <Ionicons name="checkmark" size={11} color="#fff" />
                : <Text style={[s.dotNum, i === step && s.dotNumActive]}>{i + 1}</Text>
              }
            </View>
            <Text style={[s.dotLabel, i === step && s.dotLabelActive]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Content */}
      <Animated.View style={[s.flex, { opacity: fadeAnim }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 0 && (
              <Step1 cpf={cpf} setCpf={setCpf} cnh={cnh} setCnh={setCnh} plate={plate} setPlate={setPlate} pixKey={pixKey} setPixKey={setPixKey} pixKeyType={pixKeyType} setPixKeyType={setPixKeyType} />
            )}
            {step === 1 && <Step2 docs={docs} onPick={pickDocument} />}
            {step === 2 && <Step3 cpf={cpf} cnh={cnh} plate={plate} docs={docs} />}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {step === 2 && (
          <TouchableOpacity style={s.termsRow} onPress={() => setAcceptedTerms(v => !v)} activeOpacity={0.8}>
            <Ionicons name={acceptedTerms ? 'checkbox' : 'square-outline'} size={22} color={acceptedTerms ? BLUE : MUTED} />
            <Text style={s.termsText}>
              Li e aceito a{' '}
              <Text style={s.termsLink} onPress={() => setTermsOpen(true)}>Política e Termos do Entregador</Text>.
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.btn, ((!canNext && step < 2) || (step === 2 && !acceptedTerms)) && s.btnDisabled, submitting && { opacity: 0.7 }]}
          onPress={step < 2 ? handleNext : handleSubmit}
          disabled={(!canNext && step < 2) || (step === 2 && !acceptedTerms) || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              {step === 2 && <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
              <Text style={s.btnText}>{step === 2 ? 'Enviar para análise' : 'Continuar'}</Text>
              {step < 2 && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal — Termo de Responsabilidade do Entregador */}
      <Modal visible={termsOpen} animationType="slide" transparent onRequestClose={() => setTermsOpen(false)}>
        <View style={s.termsOverlay}>
          <View style={[s.termsModal, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={s.termsHead}>
              <Text style={s.termsTitle}>Política e Termos do Entregador</Text>
              <TouchableOpacity onPress={() => setTermsOpen(false)}><Ionicons name="close" size={22} color={TEXT} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {TERMS_SECTIONS.map((sec, i) => (
                <View key={i} style={{ marginBottom: 14 }}>
                  <Text style={s.termsSectionTitle}>{sec.title}</Text>
                  <Text style={s.termsBody}>{sec.body}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.btn} onPress={() => { setAcceptedTerms(true); setTermsOpen(false) }} activeOpacity={0.85}>
              <Text style={s.btnText}>Li e aceito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  )
}

// Política e Termos do Entregador — Tá Barato (texto oficial fornecido pelo cliente).
const TERMS_SECTIONS: { title: string; body: string }[] = [
  { title: 'AUTONOMIA E NÃO EXCLUSIVIDADE', body: 'O ENTREGADOR atua de forma autônoma, sem subordinação, vínculo empregatício ou representação comercial com o TÁ BARATO, podendo prestar serviços para outras plataformas simultaneamente.' },
  { title: 'HABILITAÇÃO E REQUISITOS LEGAIS', body: 'O ENTREGADOR deve obrigatoriamente possuir Carteira Nacional de Habilitação (CNH) válida, compatível com a categoria do veículo utilizado, constando expressamente a observação de Exercício de Atividade Remunerada (EAR) dedicada ao trabalho com entregas.' },
  { title: 'LEGISLAÇÃO DE TRÂNSITO E EPI', body: 'O ENTREGADOR compromete-se a respeitar integralmente o Código de Trânsito Brasileiro (CTB) e as regulamentações municipais/estaduais de transporte de carga, utilizando obrigatoriamente os Equipamentos de Proteção Individual (EPI) exigidos por lei.' },
  { title: 'MANUTENÇÃO E CONDIÇÕES DO VEÍCULO', body: 'O ENTREGADOR é o único responsável por realizar a manutenção preventiva e corretiva regular do veículo utilizado, mantendo toda a documentação (CRLV) devidamente quitada e atualizada.' },
  { title: 'USO DE TERCEIROS E AJUDANTES', body: 'O ENTREGADOR poderá utilizar ajudantes ou prepostos sob sua inteira responsabilidade civil, penal e trabalhista.' },
  { title: 'INCIDENTES, ROUBO E EXTRAVIO', body: 'O ENTREGADOR assume integral e exclusiva responsabilidade civil e material por qualquer dano, avaria, furto, roubo ou extravio de mercadorias e valores ocorridos sob sua guarda, desde a coleta até a efetiva entrega, desobrigando a plataforma de qualquer indenização. Adicionalmente, declara inexistir vínculo empregatício, isentando a contratante de quaisquer encargos trabalhistas, previdenciários ou acidentais envolvendo a si próprio, seus prepostos ou ajudantes.' },
  { title: 'RESPONSABILIDADE FISCAL E EMISSÃO DE NOTAS', body: 'O ENTREGADOR reconhece a obrigatoriedade de regularização fiscal, seja como Microempreendedor Individual (MEI) ou outra modalidade legal, comprometendo-se a emitir Nota Fiscal de Serviço (NFs) correspondente às atividades prestadas. As partes poderão pactuar a emissão de notas fiscais consolidadas em periodicidade semanal ou mensal, cabendo à plataforma disponibilizar o relatório detalhado de corridas, datas e valores para viabilizar o cumprimento desta obrigação, conforme as exigências legais vigentes e futuras.' },
  { title: 'SIGILO E CONDUTA', body: 'É terminantemente proibido violar embalagens, reter itens ou expor dados pessoais de usuários ou estabelecimentos parceiros. O descumprimento de qualquer destas cláusulas ensejará o desligamento definitivo da plataforma, sem prejuízo da retenção de valores pendentes para reparação civil de eventuais danos e das medidas judiciais cabíveis.' },
]

// ─── Step 1 — Dados ───────────────────────────────────────────────────────────

function Step1({ cpf, setCpf, cnh, setCnh, plate, setPlate, pixKey, setPixKey, pixKeyType, setPixKeyType }: {
  cpf: string; setCpf: (v: string) => void
  cnh: string; setCnh: (v: string) => void
  plate: string; setPlate: (v: string) => void
  pixKey: string; setPixKey: (v: string) => void
  pixKeyType: string; setPixKeyType: (v: string) => void
}) {
  return (
    <View>
      <Text style={f.sectionLabel}>Dados pessoais</Text>

      <View style={f.fieldWrap}>
        <Text style={f.label}>CPF</Text>
        <View style={f.inputRow}>
          <Ionicons name="person-outline" size={17} color={MUTED} style={f.icon} />
          <TextInput
            style={f.input}
            value={cpf}
            onChangeText={v => setCpf(formatCPF(v))}
            keyboardType="numeric"
            placeholder="000.000.000-00"
            placeholderTextColor="#AFC4D0"
            maxLength={14}
          />
        </View>
      </View>

      <View style={f.fieldWrap}>
        <Text style={f.label}>Número da CNH</Text>
        <View style={f.inputRow}>
          <Ionicons name="card-outline" size={17} color={MUTED} style={f.icon} />
          <TextInput
            style={f.input}
            value={cnh}
            onChangeText={v => setCnh(v.replace(/\D/g, '').slice(0, 11))}
            keyboardType="numeric"
            placeholder="00000000000"
            placeholderTextColor="#AFC4D0"
            maxLength={11}
          />
        </View>
      </View>

      {/* Warning */}
      <View style={w.card}>
        <View style={w.topRow}>
          <View style={w.iconBadge}>
            <Ionicons name="warning-outline" size={16} color={AMBER} />
          </View>
          <Text style={w.title}>Requisitos da CNH</Text>
        </View>
        {[
          'CNH deve ter a categoria EAR (Exercício de Atividade Remunerada)',
          'Não aceitamos CNH provisória',
          'CNH deve estar dentro do prazo de validade',
        ].map(item => (
          <View key={item} style={w.row}>
            <View style={w.bullet} />
            <Text style={w.item}>{item}</Text>
          </View>
        ))}
      </View>

      <Text style={f.sectionLabel}>Veículo</Text>

      <View style={f.fieldWrap}>
        <Text style={f.label}>Placa do veículo</Text>
        <View style={f.inputRow}>
          <Ionicons name="bicycle-outline" size={17} color={MUTED} style={f.icon} />
          <TextInput
            style={[f.input, { textTransform: 'uppercase', letterSpacing: 2 }]}
            value={plate}
            onChangeText={v => setPlate(v.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 7))}
            autoCapitalize="characters"
            placeholder="ABC1D23"
            placeholderTextColor="#AFC4D0"
            maxLength={7}
          />
        </View>
      </View>

      <Text style={f.sectionLabel}>Recebimento</Text>

      <View style={f.fieldWrap}>
        <Text style={f.label}>Chave PIX (pra receber seus ganhos)</Text>
        <View style={pt.row}>
          {PIX_KEY_TYPES.map(t => (
            <TouchableOpacity
              key={t.v}
              onPress={() => setPixKeyType(t.v)}
              style={[pt.chip, pixKeyType === t.v && pt.chipOn]}
            >
              <Text style={[pt.chipText, pixKeyType === t.v && pt.chipTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={f.inputRow}>
          <Ionicons name="key-outline" size={17} color={MUTED} style={f.icon} />
          <TextInput
            style={f.input}
            value={pixKey}
            onChangeText={setPixKey}
            placeholder="CPF, e-mail, telefone ou aleatória"
            placeholderTextColor="#AFC4D0"
            autoCapitalize="none"
            keyboardType={pixKeyType === 'EMAIL' ? 'email-address' : pixKeyType === 'EVP' ? 'default' : 'numbers-and-punctuation'}
          />
        </View>
      </View>
    </View>
  )
}

// ─── Step 2 — Documentos ─────────────────────────────────────────────────────

function Step2({ docs, onPick }: { docs: Record<DocKey, DocState>; onPick: (k: DocKey) => void }) {
  return (
    <View>
      <Text style={f.sectionLabel}>Documentos necessários</Text>
      <Text style={up.intro}>
        Envie fotos nítidas e legíveis. Todos os dados devem estar visíveis, sem cortes ou reflexos.
      </Text>

      {DOCS.map(doc => {
        const state = docs[doc.key]
        const done  = !!state.url
        return (
          <TouchableOpacity
            key={doc.key}
            style={[up.card, done && up.cardDone]}
            onPress={() => !state.uploading && onPick(doc.key)}
            activeOpacity={0.75}
          >
            <View style={[up.iconBadge, done && up.iconBadgeDone]}>
              <Ionicons name={done ? 'checkmark' : doc.icon} size={20} color={done ? '#fff' : BLUE} />
            </View>
            <View style={up.textWrap}>
              <Text style={[up.cardLabel, done && up.cardLabelDone]}>{doc.label}</Text>
              <Text style={up.cardSub}>{done ? 'Enviado com sucesso' : doc.sub}</Text>
            </View>
            <View>
              {state.uploading ? (
                <ActivityIndicator size="small" color={BLUE} />
              ) : state.uri ? (
                state.isPdf ? (
                  <View style={up.pdfThumb}>
                    <Ionicons name="document-text" size={22} color={BLUE} />
                    <Text style={up.pdfLabel}>PDF</Text>
                  </View>
                ) : (
                  // Preview usa o arquivo LOCAL — state.url agora é um path privado
                  // (não renderiza como imagem).
                  <Image source={{ uri: state.uri }} style={up.thumb} />
                )
              ) : (
                <View style={up.camBtn}>
                  <Ionicons name="camera-outline" size={18} color={BLUE} />
                </View>
              )}
            </View>
          </TouchableOpacity>
        )
      })}

      <View style={up.tip}>
        <Ionicons name="information-circle-outline" size={14} color={MUTED} />
        <Text style={up.tipText}>Use boa iluminação. Evite reflexos e sombras sobre os documentos.</Text>
      </View>
    </View>
  )
}

// ─── Step 3 — Revisão ─────────────────────────────────────────────────────────

function Step3({ cpf, cnh, plate, docs }: {
  cpf: string; cnh: string; plate: string; docs: Record<DocKey, DocState>
}) {
  return (
    <View>
      <Text style={f.sectionLabel}>Dados pessoais</Text>
      <View style={rv.card}>
        {[
          { label: 'CPF',   value: maskCPF(cpf), icon: 'person-outline'  as const },
          { label: 'CNH',   value: cnh,          icon: 'card-outline'    as const },
          { label: 'Placa', value: plate,         icon: 'bicycle-outline' as const },
        ].map((row, i, arr) => (
          <View key={row.label} style={[rv.row, i < arr.length - 1 && rv.rowBorder]}>
            <View style={rv.rowIcon}>
              <Ionicons name={row.icon} size={15} color={BLUE} />
            </View>
            <Text style={rv.rowLabel}>{row.label}</Text>
            <Text style={rv.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      <Text style={[f.sectionLabel, { marginTop: 20 }]}>Documentos</Text>
      <View style={rv.card}>
        {DOCS.map((doc, i) => (
          <View key={doc.key} style={[rv.row, i < DOCS.length - 1 && rv.rowBorder]}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            <Text style={rv.docLabel}>{doc.label}</Text>
          </View>
        ))}
      </View>

      <View style={rv.infoBox}>
        <View style={rv.infoTopRow}>
          <View style={rv.infoIconWrap}>
            <Ionicons name="time-outline" size={18} color={BLUE} />
          </View>
          <Text style={rv.infoTitle}>Análise em até 24h</Text>
        </View>
        <Text style={rv.infoText}>
          Nossa equipe irá analisar seus documentos após o envio. Você receberá uma notificação quando sua conta for aprovada e você puder começar a fazer entregas.
        </Text>
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '800', color: TEXT,
  },

  progressWrap: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    backgroundColor: CARD, paddingHorizontal: 16,
    paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  progressItem: { flex: 1, alignItems: 'center', position: 'relative' },
  progressLine: {
    position: 'absolute', top: 13, right: '50%', left: '-50%',
    height: 2, backgroundColor: '#F0E8E0',
  },
  progressLineDone: { backgroundColor: GREEN },
  dot: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#F0E8E0',
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
  },
  dotActive: { backgroundColor: BLUE },
  dotDone:   { backgroundColor: GREEN },
  dotNum:        { fontSize: 11, fontWeight: '700', color: MUTED },
  dotNumActive:  { color: '#fff' },
  dotLabel:      { fontSize: 10, fontWeight: '600', color: MUTED, textAlign: 'center' },
  dotLabelActive:{ fontSize: 10, fontWeight: '800', color: BLUE,  textAlign: 'center' },

  footer: {
    backgroundColor: CARD, paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  btn: {
    backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: BLUE_DARK, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 8, elevation: 5,
  },
  btnDisabled: { backgroundColor: '#D4B8A8', shadowOpacity: 0, elevation: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12, paddingHorizontal: 2 },
  termsText: { flex: 1, fontSize: 13, color: MUTED, lineHeight: 19 },
  termsLink: { color: BLUE, fontWeight: '800', textDecorationLine: 'underline' },

  termsOverlay: { flex: 1, backgroundColor: 'rgba(26,10,0,0.5)', justifyContent: 'flex-end' },
  termsModal: {
    backgroundColor: CARD, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 18, gap: 14,
  },
  termsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  termsTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: TEXT },
  termsSectionTitle: { fontSize: 12.5, fontWeight: '800', color: BLUE, letterSpacing: 0.3, marginBottom: 3 },
  termsBody: { fontSize: 13.5, color: TEXT, lineHeight: 21 },
})

const f = StyleSheet.create({
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  fieldWrap: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: MUTED, marginBottom: 6, letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, minHeight: 52,
  },
  icon:  { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: TEXT, paddingVertical: 14 },
})

const pt = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD,
  },
  chipOn: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  chipText: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  chipTextOn: { color: BLUE },
})

const w = StyleSheet.create({
  card: {
    backgroundColor: AMBER_BG, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: AMBER_LINE,
    borderLeftWidth: 4, borderLeftColor: AMBER,
    marginBottom: 20, gap: 8,
  },
  topRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBadge:{
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center',
  },
  title:  { fontSize: 13, fontWeight: '800', color: '#92400E' },
  row:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: AMBER, marginTop: 7, flexShrink: 0 },
  item:   { flex: 1, fontSize: 12, color: '#78350F', lineHeight: 18, fontWeight: '500' },
})

const up = StyleSheet.create({
  intro: { fontSize: 13, color: MUTED, lineHeight: 19, marginBottom: 14, fontWeight: '500' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  cardDone:     { borderColor: '#A7F3D0', backgroundColor: '#F0FDF9' },
  iconBadge:    {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: BLUE_LIGHT, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBadgeDone:{ backgroundColor: GREEN },
  textWrap:     { flex: 1 },
  cardLabel:    { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 2 },
  cardLabelDone:{ color: '#065F46' },
  cardSub:      { fontSize: 12, color: MUTED, fontWeight: '500' },
  thumb:    { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#A7F3D0' },
  pdfThumb: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: BLUE_LIGHT, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', gap: 1,
  },
  pdfLabel: { fontSize: 9, fontWeight: '800', color: BLUE },
  camBtn: {
    width: 40, height: 40, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed',
    backgroundColor: BLUE_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  tip:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4, paddingHorizontal: 2 },
  tipText: { flex: 1, fontSize: 11, color: MUTED, lineHeight: 16, fontWeight: '500' },
})

const rv = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F8FF' },
  rowIcon:   {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: BLUE_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  rowLabel:  { flex: 1, fontSize: 13, color: MUTED, fontWeight: '600' },
  rowValue:  { fontSize: 14, fontWeight: '800', color: TEXT },
  docLabel:  { flex: 1, fontSize: 13, fontWeight: '600', color: TEXT },
  infoBox: {
    marginTop: 20, backgroundColor: BLUE_LIGHT,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#FFD4B3', gap: 8,
  },
  infoTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#FFD4B3', alignItems: 'center', justifyContent: 'center',
  },
  infoTitle: { fontSize: 14, fontWeight: '800', color: BLUE_DARK },
  infoText:  { fontSize: 13, color: MUTED, lineHeight: 19, fontWeight: '500' },
})
