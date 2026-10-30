function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error('Не знайдено елемент ' + selector)
  return found
}

const photoInput = element<HTMLInputElement>('#photo')
const modelSelect = element<HTMLSelectElement>('#model')
const refreshButton = element<HTMLButtonElement>('#refresh-models')
const describeButton = element<HTMLButtonElement>('#describe')
const describeLabel = element<HTMLSpanElement>('#describe-label')
const resultField = element<HTMLDivElement>('#result')
const resultStatus = element<HTMLParagraphElement>('#result-status')
const resultPanel = element<HTMLElement>('#result-panel')
const statusIndicator = element<HTMLDivElement>('#status-indicator')
const errorField = element<HTMLDivElement>('#error')
const preview = element<HTMLImageElement>('#preview')
const previewContainer = element<HTMLDivElement>('#preview-container')
const emptyPreview = element<HTMLDivElement>('#empty-preview')
const fileInfo = element<HTMLParagraphElement>('#file-info')
const spinner = document.querySelector<SVGElement>('#spinner')!
const modeSelect = element<HTMLSelectElement>('#description-mode')
const modeHelp = element<HTMLParagraphElement>('#mode-help')
const resultHeading = element<HTMLHeadingElement>('#result-heading')
const maxTokensInput = element<HTMLInputElement>('#max-tokens')
const temperatureInput = element<HTMLInputElement>('#temperature')
const topPInput = element<HTMLInputElement>('#top-p')
const seedInput = element<HTMLInputElement>('#seed')

type DescriptionMode = 'photo' | 'social' | 'alt'
const DESCRIPTION_MODES: Record<DescriptionMode, {
  title: string
  action: string
  pending: string
  help: string
  prompt: string
}> = {
  photo: {
    title: 'Опис фотографії',
    action: 'Створити опис',
    pending: 'Створюємо опис…',
    help: 'Короткий опис об’єктів, дій та оточення у 2–3 реченнях.',
    prompt: `Опиши це зображення українською у 2–3 реченнях зв’язним текстом.
      Правила:
      1. Спершу назви головні об’єкти та їхні дії, потім оточення (місце, освітлення, помітні кольори), якщо вони видимі. Починай одразу з суті, без вступів на кшталт «На фото».
      2. Описуй лише те, що видно. Не вигадуй подій, причин, намірів чи емоцій людей.
      3. Якщо важлива деталь нечітка, зазнач це коротко й природно («схоже на…», «ймовірно…»). Не додавай застережень до кожної деталі, лише там, де сумнів справді є.
      4. Не називай людей на ім’я й не визначай особу за обличчям. Описуй за видимими ознаками: приблизний вік, одяг, поза.
      5. Якщо на зображенні є помітний текст (вивіска, напис), згадай його.
      6. Без заголовків, списків і оцінок («гарний», «чудовий»).
      Поверни лише опис.`,
  },
  social: {
    title: 'Підпис для допису в соцмережі',
    action: 'Створити підпис',
    pending: 'Створюємо підпис…',
    help: 'Один природний підпис до 20 слів, без хештегів та вигаданої історії.',
    prompt: `Напиши українською один короткий підпис до цієї фотографії для допису в соцмережі.
      Правила:
      1. До 20 слів, лише один варіант. Тон живий, емоційний і експресивний, як у справжнього допису, а не як рекламне гасло.
      2. Емоцію бери з того, що видно: настрій кадру, світло, кольори, дія, деталі. Не вигадуй подій, місця знімання, дати чи особистої історії.
      3. Додай 1–3 доречні емоджі, розмістивши їх природно (в кінці або всередині). Вони не входять у ліміт слів.
      4. Без хештегів, згадок (@), закликів «лайкайте/підписуйтесь», лапок і заїжджених фраз на кшталт «життя — це подорож».
      5. Не називай людей на ім’я й не визначай особу за обличчям.
      Поверни лише текст підпису.`,
  },
  alt: {
    title: 'Альтернативний текст',
    action: 'Створити alt-текст',
    pending: 'Створюємо alt-текст…',
    help: 'Стислий зміст зображення для користувачів скринридерів, без вступу «На фото».',
    prompt: `Напиши українською альтернативний текст (атрибут alt) для цього зображення. Його прочитає скринридер для людини, яка зображення не бачить, тому текст має передавати те, що важливо для розуміння.
      Правила:
      1. Одне речення, до 20 слів і не довше 125 символів. Починай одразу з суті, без вступів на кшталт «На фото», «На зображенні», «Зображення», «Картинка».
      2. Спершу назви головний об'єкт і дію, потім лише ті деталі оточення, які суттєві для розуміння.
      3. Описуй тільки те, що чітко видно. Не вгадуй і не вигадуй події, місце, наміри чи емоції. Якщо деталь нечітка, пропусти її.
      4. Не називай людей на ім'я й не визначай особу за обличчям. Описуй за видимими ознаками, наприклад «жінка в червоному пальті».
      5. Якщо на зображенні є значущий текст (вивіска, напис), передай його дослівно. Для графіка чи схеми вкажи тип і головний висновок.
      6. Без оцінок («гарний», «чудовий»), реклами, емоджі, лапок і заголовків.
      Поверни лише готовий alt-текст одним рядком, без пояснень.`,
  },
}

type GenerationParameters = {
  max_tokens: number
  temperature: number
  top_p: number
  seed?: number
}

function selectedMode() {
  return DESCRIPTION_MODES[modeSelect.value as DescriptionMode] ?? DESCRIPTION_MODES.photo
}

function readNumber(input: HTMLInputElement, label: string, min: number, max: number, integer = false): number {
  const raw = input.value.trim()
  const value = Number(raw)
  if (!raw || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    input.focus()
    throw new Error(label + ': введіть ' + (integer ? 'ціле число' : 'число') + ' від ' + min + ' до ' + max + '.')
  }
  return value
}

function readGenerationParameters(): GenerationParameters {
  return {
    max_tokens: readNumber(maxTokensInput, 'Максимум токенів', 1, 2048, true),
    temperature: readNumber(temperatureInput, 'Температура', 0, 2),
    top_p: readNumber(topPInput, 'Top-p', 0.01, 1),
    ...(seedInput.value.trim() ? { seed: readNumber(seedInput, 'Seed', 0, 2147483647, true) } : {}),
  }
}

const API_BASE = '/ollama/v1'
const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
let imageDataURL: string | null = null
let busy = false
let readingImage = false
let loadingModels = false
let modelsReady = false
let imageSelection = 0

type Status = 'loading' | 'ready' | 'error'

const MIN_LOADING_MS = 600
const STATUS_CLASSES: Record<Status, string[]> = {
  loading: ['bg-sun', 'animate-pulse'],
  ready: ['bg-leaf'],
  error: ['bg-red-500'],
}

let statusTimer: number | undefined

const ALL_STATUS_CLASSES = Object.values(STATUS_CLASSES).flat()

function setStatus(status: Status) {
  clearTimeout(statusTimer)
  statusIndicator.classList.remove(...ALL_STATUS_CLASSES)
  statusIndicator.classList.add(...STATUS_CLASSES[status])
}

function setStatusAfterMin(status: Status, startedAt: number) {
  const remaining = MIN_LOADING_MS - (performance.now() - startedAt)
  if (remaining <= 0) return setStatus(status)
  statusTimer = window.setTimeout(() => setStatus(status), remaining)
}

function updateControls() {
  const mode = selectedMode()
  describeButton.disabled = busy || readingImage || !imageDataURL || !modelsReady || !modelSelect.value
  photoInput.disabled = busy
  modelSelect.disabled = busy || !modelsReady
  refreshButton.disabled = busy || loadingModels
  spinner.toggleAttribute('hidden', !busy)
  describeLabel.textContent = busy ? mode.pending : mode.action
  for (const control of [modeSelect, maxTokensInput, temperatureInput, topPInput, seedInput]) {
    control.disabled = busy
  }
  resultHeading.textContent = mode.title
  modeHelp.textContent = mode.help
  resultPanel.setAttribute('aria-busy', String(busy))
}

function clearError() {
  errorField.hidden = true
  errorField.textContent = ''
}

function showError(error: unknown) {
  errorField.textContent = error instanceof Error ? error.message : 'Сталася невідома помилка.'
  errorField.hidden = false
}

async function requestJSON<T>(path: string, options: RequestInit = {}, timeout = 15_000): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_BASE + path, {
      ...options,
      signal: AbortSignal.timeout(timeout),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('Час очікування вичерпано. Спробуйте ще раз або оберіть меншу модель.')
    }
    throw new Error('Не вдалося підключитися до Ollama. Переконайтеся, що застосунок Ollama запущений.')
  }

  let raw: string
  try {
    raw = await response.text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('Час очікування вичерпано. Спробуйте ще раз або оберіть меншу модель.')
    }
    throw new Error('З’єднання з Ollama перервалося під час отримання відповіді. Спробуйте ще раз.')
  }
  if (!response.ok) {
    if ([502, 503, 504].includes(response.status) || (response.status === 500 && !raw.trim())) {
      throw new Error('Ollama недоступна. Запустіть її та натисніть «Оновити список».')
    }
    let details = ''
    try {
      const body = JSON.parse(raw)
      details = typeof body.error === 'string' ? body.error : body.error?.message ?? ''
    } catch { }
    throw new Error(('Модель не змогла виконати запит (HTTP ' + response.status + '). ' + details.slice(0, 500)).trim())
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('Сервер повернув некоректну відповідь. Перевірте підключення до Ollama й повторіть спробу.')
  }
}

async function getModels() {
  const previousModel = modelSelect.value
  const startedAt = performance.now()
  loadingModels = true
  modelsReady = false
  setStatus('loading')
  clearError()
  updateControls()

  try {
    const payload = await requestJSON<{ data?: { id?: unknown }[] }>('/models')
    if (!Array.isArray(payload?.data)) throw new Error('Сервер повернув некоректний список моделей.')
    const models = [...new Set(payload.data.map((model) => model?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0))].sort()
    modelSelect.replaceChildren()
    if (!models.length) {
      modelSelect.add(new Option('Немає встановлених моделей', ''))
      throw new Error('В Ollama немає встановлених моделей. Завантажте gemma3:4b та оновіть список.')
    }
    for (const model of models) modelSelect.add(new Option(model, model))
    modelSelect.value = models.includes(previousModel) ? previousModel
      : models.includes('gemma3:4b') ? 'gemma3:4b' : models[0]!
    modelsReady = true
    setStatusAfterMin('ready', startedAt)
  } catch (error) {
    modelSelect.replaceChildren(new Option('Не вдалося завантажити моделі', ''))
    setStatusAfterMin('error', startedAt)
    showError(error)
  } finally {
    loadingModels = false
    updateControls()
  }
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('Не вдалося прочитати фотографію.'))
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл. Прикріпіть його ще раз.'))
    reader.onabort = () => reject(new Error('Читання файлу перервано.'))
    reader.readAsDataURL(file)
  })
}

photoInput.addEventListener('change', async () => {
  const selection = ++imageSelection
  const file = photoInput.files?.[0]
  imageDataURL = null
  resultField.textContent = ''
  resultStatus.textContent = 'Оберіть фото та натисніть «' + selectedMode().action + '».'
  previewContainer.hidden = true
  emptyPreview.hidden = false
  preview.removeAttribute('src')
  clearError()
  readingImage = Boolean(file)
  updateControls()
  if (!file) return

  try {
    if (!IMAGE_TYPES.has(file.type)) throw new Error('Оберіть фотографію у форматі JPG, PNG або WebP.')
    if (file.size > MAX_IMAGE_SIZE) throw new Error('Файл завеликий. Максимальний розмір фотографії — 10 МБ.')
    const dataURL = await fileToDataURL(file)
    if (selection !== imageSelection) return
    preview.src = dataURL
    await preview.decode()
    if (selection !== imageSelection) return
    imageDataURL = dataURL
    fileInfo.textContent = file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' МБ · ' + preview.naturalWidth + ' × ' + preview.naturalHeight
    previewContainer.hidden = false
    emptyPreview.hidden = true
    resultStatus.textContent = 'Фото готове. Натисніть «' + selectedMode().action + '».'
  } catch (error) {
    if (selection !== imageSelection) return
    photoInput.value = ''
    preview.removeAttribute('src')
    showError(error instanceof DOMException ? new Error('Не вдалося відкрити зображення. Файл може бути пошкоджений.') : error)
  } finally {
    if (selection === imageSelection) {
      readingImage = false
      updateControls()
    }
  }
})

describeButton.addEventListener('click', async () => {
  if (!imageDataURL || !modelSelect.value || busy) return
  let parameters: GenerationParameters
  try {
    parameters = readGenerationParameters()
  } catch (error) {
    showError(error)
    return
  }
  const mode = selectedMode()
  busy = true
  clearError()
  resultField.textContent = ''
  resultStatus.textContent = 'Модель аналізує фотографію. Перший запуск може тривати довше.'
  updateControls()

  const requestParams = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelSelect.value,
        messages: [
          { role: 'system', content: 'Відповідай українською. Описуй видимі ознаки та не вигадуй деталей.' },
          { role: 'user', content: [
            { type: 'text', text: mode.prompt },
            { type: 'image_url', image_url: { url: imageDataURL } },
          ] },
        ],
        ...parameters,
        stream: false,
      }),
    }

  console.log(requestParams)

  try {
    const payload = await requestJSON<{
      choices?: { message?: { content?: unknown }; finish_reason?: string }[]
    }>('/chat/completions', requestParams, 120_000)

    const choice = payload?.choices?.[0]
    const description = choice?.message?.content
    if (typeof description !== 'string' || !description.trim()) {
      throw new Error('Модель повернула порожній або некоректний опис. Спробуйте ще раз чи оберіть іншу модель із підтримкою зображень.')
    }
    resultField.textContent = description.trim()
    resultStatus.textContent = choice?.finish_reason === 'length'
      ? 'Досягнуто обмеження довжини. Відповідь може бути незавершеною.' : 'Відповідь готова.'
  } catch (error) {
    resultStatus.textContent = 'Не вдалося створити відповідь. Можна повторити спробу.'
    showError(error)
  } finally {
    busy = false
    updateControls()
  }
})

modelSelect.addEventListener('change', () => {
  clearError()
  updateControls()
})
modeSelect.addEventListener('change', () => {
  clearError()
  updateControls()
})
refreshButton.addEventListener('click', getModels)
void getModels()
