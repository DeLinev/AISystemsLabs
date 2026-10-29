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
// const connectionStatus = element<HTMLParagraphElement>('#connection-status')
const statusIndicator = element<HTMLDivElement>('#status-indicator')
const errorField = element<HTMLDivElement>('#error')
const preview = element<HTMLImageElement>('#preview')
const previewContainer = element<HTMLDivElement>('#preview-container')
const emptyPreview = element<HTMLDivElement>('#empty-preview')
const fileInfo = element<HTMLParagraphElement>('#file-info')
const spinner = document.querySelector<SVGElement>('#spinner')!

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
  describeButton.disabled = busy || readingImage || !imageDataURL || !modelsReady || !modelSelect.value
  photoInput.disabled = busy
  modelSelect.disabled = busy || !modelsReady
  refreshButton.disabled = busy || loadingModels
  spinner.toggleAttribute('hidden', !busy)
  describeLabel.textContent = busy ? 'Створюємо опис…' : 'Створити опис'
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
    } catch { /* Для не-JSON помилки достатньо HTTP-статусу. */ }
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
  resultStatus.textContent = 'Оберіть фото та натисніть «Створити опис».'
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
    resultStatus.textContent = 'Фото готове. Натисніть «Створити опис».'
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
  busy = true
  clearError()
  resultField.textContent = ''
  resultStatus.textContent = 'Модель аналізує фотографію. Перший запуск може тривати довше.'
  updateControls()

  try {
    const payload = await requestJSON<{
      choices?: { message?: { content?: unknown }; finish_reason?: string }[]
    }>('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelSelect.value,
        messages: [
          { role: 'system', content: 'Відповідай українською. Описуй видимі ознаки та не вигадуй деталей.' },
          { role: 'user', content: [
            { type: 'text', text: 'Опиши це зображення українською у 2–3 реченнях. Якщо деталь невиразна, зазнач невпевненість.' },
            { type: 'image_url', image_url: { url: imageDataURL } },
          ] },
        ],
        temperature: 0.2,
        max_tokens: 300,
        seed: 1,
        stream: false,
      }),
    }, 120_000)

    const choice = payload?.choices?.[0]
    const description = choice?.message?.content
    if (typeof description !== 'string' || !description.trim()) {
      throw new Error('Модель повернула порожній або некоректний опис. Спробуйте ще раз чи оберіть іншу модель із підтримкою зображень.')
    }
    resultField.textContent = description.trim()
    resultStatus.textContent = choice?.finish_reason === 'length'
      ? 'Досягнуто обмеження довжини. Опис може бути незавершеним.' : 'Опис готовий.'
  } catch (error) {
    resultStatus.textContent = 'Не вдалося створити опис. Можна повторити спробу.'
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
refreshButton.addEventListener('click', getModels)
void getModels()
