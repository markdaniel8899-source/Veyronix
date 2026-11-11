<template>
  <section class="domain-check">
    <div class="domain-check__head">
      <div>
        <p class="domain-check__eyebrow">{{ t('domainCheck.eyebrow') }}</p>
        <h3 class="domain-check__title">{{ t('domainCheck.title') }}</h3>
        <p class="domain-check__hint">{{ t('domainCheck.hint') }}</p>
      </div>
      <span class="domain-check__badge">SaaS</span>
    </div>

    <div v-if="suggestedNames.length" class="domain-check__suggestions">
      <span class="domain-check__suggestions-label">{{ t('domainCheck.suggested') }}</span>
      <button
        v-for="candidate in suggestedNames"
        :key="candidate"
        type="button"
        class="domain-chip"
        :class="{ 'is-active': normalizeName(candidate) === normalizeName(nameInput) }"
        @click="useCandidate(candidate)"
      >
        {{ candidate }}
      </button>
    </div>

    <form class="domain-check__form" @submit.prevent="checkAll">
      <input
        v-model="nameInput"
        class="domain-check__input"
        type="text"
        maxlength="80"
        :placeholder="t('domainCheck.placeholder')"
        :aria-label="t('domainCheck.placeholder')"
      />
      <button class="domain-check__button" type="submit" :disabled="isChecking || !nameInput.trim()">
        {{ isChecking ? t('domainCheck.checking') : t('domainCheck.check') }}
      </button>
    </form>

    <div v-if="results.length" class="domain-check__results">
      <div
        v-for="result in results"
        :key="result.domain"
        class="domain-result"
        :class="`is-${result.status}`"
      >
        <span class="domain-result__name">{{ result.domain }}</span>
        <span class="domain-result__status">
          <span class="domain-result__dot"></span>
          {{ statusLabel(result.status) }}
        </span>
      </div>
    </div>

    <p class="domain-check__note">{{ t('domainCheck.note') }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  title: { type: String, default: '' },
  content: { type: String, default: '' }
})

const { t } = useI18n()

const nameInput = ref('')
const isChecking = ref(false)
const results = ref([])

const GENERIC_WORDS = new Set([
  'report', 'prediction', 'analysis', 'simulation', 'market', 'future',
  'summary', 'overview', 'introduction', 'conclusion', 'section', 'chapter',
  'scenario', 'strategy', 'insight', 'insights', 'findings', 'recommendation',
  'recommendations', 'the', 'and', 'for', 'with', 'from', 'into', 'about',
  'product', 'company', 'brand', 'startup', 'platform', 'saas', 'app'
])

const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9\s.-]/g, '')
    .replace(/[\s._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

const extractCandidates = (title, content) => {
  const text = `${title}\n${content}`.slice(0, 60000)
  const found = []

  const add = (value) => {
    const cleaned = String(value || '')
      .replace(/[*_`#>]/g, '')
      .replace(/\(.*?\)/g, '')
      .trim()
    if (!cleaned || cleaned.length < 3 || cleaned.length > 40) return
    const words = cleaned.split(/\s+/).filter(Boolean)
    if (!words.length || words.every((word) => GENERIC_WORDS.has(word.toLowerCase()))) return
    if (words.length > 4) return
    const display = words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    if (!found.some((item) => item.toLowerCase() === display.toLowerCase())) {
      found.push(display)
    }
  }

  const labelled = /(?:product|brand|company|startup|platform|app|saas)\s*(?:name)?\s*[:\-]\s*\*{0,2}([A-Za-z0-9][A-Za-z0-9 .&'-]{1,39})/gi
  let match
  while ((match = labelled.exec(text)) !== null) {
    add(match[1].split(/[.,;:\n]/)[0])
  }

  const bolded = /\*\*([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,2})\*\*/g
  while ((match = bolded.exec(text)) !== null) {
    add(match[1])
  }

  if (title) {
    const titleWords = title
      .replace(/[^A-Za-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    const meaningful = titleWords.filter((word) => !GENERIC_WORDS.has(word.toLowerCase()))
    if (meaningful.length) {
      add(meaningful.slice(0, 2).join(' '))
    }
  }

  return found.slice(0, 6)
}

const suggestedNames = computed(() => extractCandidates(props.title, props.content))

const useCandidate = (candidate) => {
  nameInput.value = normalizeName(candidate).replace(/-/g, ' ')
  results.value = []
}

const statusLabel = (status) => {
  if (status === 'available') return t('domainCheck.available')
  if (status === 'taken') return t('domainCheck.taken')
  if (status === 'checking') return t('domainCheck.checkingShort')
  return t('domainCheck.unknown')
}

const lookupRdap = async (domain, signal) => {
  const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    headers: { Accept: 'application/rdap+json' },
    signal
  })
  if (response.status === 404) return 'available'
  if (response.ok) return 'taken'
  return 'unknown'
}

const lookupDoh = async (domain, signal) => {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=SOA`,
    { headers: { Accept: 'application/dns-json' }, signal }
  )
  if (!response.ok) return 'unknown'
  const data = await response.json()
  if (data.Status === 3) return 'available'
  if (data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0) {
    return 'taken'
  }
  return 'unknown'
}

const checkDomain = async (domain) => {
  const entry = results.value.find((item) => item.domain === domain)
  if (entry) entry.status = 'checking'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  let status = 'unknown'
  try {
    status = await lookupRdap(domain, controller.signal)
  } catch {
    status = 'unknown'
  }
  if (status === 'unknown') {
    try {
      status = await lookupDoh(domain, controller.signal)
    } catch {
      status = 'unknown'
    }
  }
  clearTimeout(timer)
  const target = results.value.find((item) => item.domain === domain)
  if (target) target.status = status
}

const checkAll = async () => {
  const base = normalizeName(nameInput.value)
  if (!base) return
  const targets = base.includes('.') ? [base] : [`${base}.com`, `${base}.io`, `${base}.ai`]
  isChecking.value = true
  results.value = targets.map((domain) => ({ domain, status: 'checking' }))
  await Promise.all(targets.map(checkDomain))
  isChecking.value = false
}
</script>

<style scoped>
.domain-check {
  border: 1px solid #e5e7eb;
  background: #fafafa;
  padding: 20px 22px;
  margin-bottom: 32px;
}

.domain-check__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.domain-check__eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #ff6b35;
  margin-bottom: 4px;
}

.domain-check__title {
  font-family: 'Times New Roman', Times, serif;
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
}

.domain-check__hint {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.domain-check__badge {
  border: 1px solid #111827;
  color: #111827;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 3px 7px;
  flex-shrink: 0;
}

.domain-check__suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.domain-check__suggestions-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b7280;
  margin-right: 4px;
}

.domain-chip {
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #374151;
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.domain-chip:hover,
.domain-chip.is-active {
  border-color: #ff6b35;
  color: #ff6b35;
}

.domain-check__form {
  display: flex;
  gap: 8px;
}

.domain-check__input {
  flex: 1;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #111827;
  font-family: inherit;
  font-size: 13px;
  padding: 9px 11px;
  outline: none;
}

.domain-check__input:focus {
  border-color: #111827;
}

.domain-check__button {
  border: 1px solid #111827;
  background: #111827;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 9px 16px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.domain-check__button:hover:not(:disabled) {
  background: #ff6b35;
  border-color: #ff6b35;
}

.domain-check__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.domain-check__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.domain-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  padding: 8px 11px;
}

.domain-result__name {
  font-size: 12px;
  color: #111827;
  font-weight: 600;
}

.domain-result__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6b7280;
}

.domain-result__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
}

.domain-result.is-available .domain-result__status {
  color: #047857;
}

.domain-result.is-available .domain-result__dot {
  background: #10b981;
}

.domain-result.is-taken .domain-result__status {
  color: #b91c1c;
}

.domain-result.is-taken .domain-result__dot {
  background: #ef4444;
}

.domain-result.is-checking .domain-result__dot {
  background: #f59e0b;
}

.domain-check__note {
  margin-top: 10px;
  font-size: 10px;
  color: #9ca3af;
  line-height: 1.5;
}
</style>
